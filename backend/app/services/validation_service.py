"""
Validation Service

Validates Kyverno policies against schemas and best practices.
"""

import yaml
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


class ValidationService:
    """
    Service for validating Kyverno policies.
    """
    
    # Required fields for a valid Kyverno policy
    REQUIRED_FIELDS = ["apiVersion", "kind", "metadata", "spec"]
    VALID_KINDS = ["ClusterPolicy", "Policy"]
    VALID_API_VERSIONS = ["kyverno.io/v1", "kyverno.io/v2beta1"]
    
    VALIDATION_FAILURE_ACTIONS = ["Audit", "Enforce", "audit", "enforce"]
    
    def __init__(self):
        pass
    
    def validate_yaml(self, yaml_content: str) -> Dict[str, Any]:
        """
        Validate YAML syntax.
        
        Args:
            yaml_content: YAML string to validate
            
        Returns:
            Validation result dictionary
        """
        result = {
            "valid": True,
            "errors": [],
            "warnings": [],
        }
        
        try:
            docs = list(yaml.safe_load_all(yaml_content))
            if not docs or all(d is None for d in docs):
                result["valid"] = False
                result["errors"].append("Empty YAML document")
        except yaml.YAMLError as e:
            result["valid"] = False
            result["errors"].append(f"Invalid YAML syntax: {e}")
        
        return result
    
    def validate_policy(self, policy_yaml: str) -> Dict[str, Any]:
        """
        Validate a Kyverno policy.
        
        Args:
            policy_yaml: Policy YAML string
            
        Returns:
            Validation result dictionary
        """
        result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "info": {},
        }
        
        # First validate YAML syntax
        yaml_result = self.validate_yaml(policy_yaml)
        if not yaml_result["valid"]:
            return yaml_result
        
        try:
            policy = yaml.safe_load(policy_yaml)
        except yaml.YAMLError as e:
            result["valid"] = False
            result["errors"].append(f"Failed to parse YAML: {e}")
            return result
        
        # Check required fields
        for field in self.REQUIRED_FIELDS:
            if field not in policy:
                result["valid"] = False
                result["errors"].append(f"Missing required field: {field}")
        
        if not result["valid"]:
            return result
        
        # Validate apiVersion
        api_version = policy.get("apiVersion", "")
        if api_version not in self.VALID_API_VERSIONS:
            result["warnings"].append(
                f"Unexpected apiVersion '{api_version}'. "
                f"Expected one of: {self.VALID_API_VERSIONS}"
            )
        
        # Validate kind
        kind = policy.get("kind", "")
        if kind not in self.VALID_KINDS:
            result["valid"] = False
            result["errors"].append(
                f"Invalid kind '{kind}'. Must be one of: {self.VALID_KINDS}"
            )
        
        # Validate metadata
        metadata = policy.get("metadata", {})
        if not metadata.get("name"):
            result["valid"] = False
            result["errors"].append("Policy must have a name in metadata")
        
        # Validate spec
        spec = policy.get("spec", {})
        result.update(self._validate_spec(spec))
        
        # Extract info
        result["info"] = {
            "name": metadata.get("name"),
            "kind": kind,
            "rules_count": len(spec.get("rules", [])),
        }
        
        return result
    
    def _validate_spec(self, spec: Dict[str, Any]) -> Dict[str, Any]:
        """Validate the spec section of a policy"""
        result = {
            "errors": [],
            "warnings": [],
        }
        
        # Check rules
        rules = spec.get("rules", [])
        if not rules:
            result["errors"].append("Policy must have at least one rule in spec.rules")
        
        for i, rule in enumerate(rules):
            rule_errors = self._validate_rule(rule, i)
            result["errors"].extend(rule_errors["errors"])
            result["warnings"].extend(rule_errors["warnings"])
        
        # Check validationFailureAction
        action = spec.get("validationFailureAction")
        if action and action not in self.VALIDATION_FAILURE_ACTIONS:
            result["warnings"].append(
                f"Invalid validationFailureAction '{action}'. "
                f"Expected one of: {self.VALIDATION_FAILURE_ACTIONS}"
            )
        
        # Check for deprecated fields
        if "validationFailureActionOverrides" in spec:
            result["warnings"].append(
                "validationFailureActionOverrides is deprecated in v1"
            )
        
        return result
    
    def _validate_rule(self, rule: Dict[str, Any], index: int) -> Dict[str, Any]:
        """Validate a single rule"""
        result = {
            "errors": [],
            "warnings": [],
        }
        
        rule_prefix = f"Rule[{index}]"
        
        # Check name
        if not rule.get("name"):
            result["errors"].append(f"{rule_prefix}: Rule must have a name")
        else:
            rule_prefix = f"Rule '{rule['name']}'"
        
        # Check match
        if "match" not in rule:
            result["errors"].append(f"{rule_prefix}: Rule must have a 'match' block")
        
        # Check for at least one action
        actions = ["validate", "mutate", "generate", "verifyImages"]
        has_action = any(action in rule for action in actions)
        
        if not has_action:
            result["errors"].append(
                f"{rule_prefix}: Rule must have at least one action "
                f"({', '.join(actions)})"
            )
        
        return result
    
    def validate_policy_parameters(
        self, 
        parameters: Dict[str, Any],
        schema: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Validate policy parameters against a schema.
        
        Args:
            parameters: Parameter values to validate
            schema: JSON schema for parameters
            
        Returns:
            Validation result dictionary
        """
        result = {
            "valid": True,
            "errors": [],
            "warnings": [],
        }
        
        # Check required parameters
        required = schema.get("required", [])
        for param in required:
            if param not in parameters:
                result["valid"] = False
                result["errors"].append(f"Missing required parameter: {param}")
        
        # Validate types
        properties = schema.get("properties", {})
        for param, value in parameters.items():
            if param not in properties:
                result["warnings"].append(f"Unknown parameter: {param}")
                continue
            
            prop_schema = properties[param]
            type_errors = self._validate_type(param, value, prop_schema)
            result["errors"].extend(type_errors)
            if type_errors:
                result["valid"] = False
        
        return result
    
    def _validate_type(
        self, 
        name: str, 
        value: Any, 
        schema: Dict[str, Any]
    ) -> List[str]:
        """Validate a value against its type schema"""
        errors = []
        expected_type = schema.get("type")
        
        type_map = {
            "string": str,
            "integer": int,
            "number": (int, float),
            "boolean": bool,
            "array": list,
            "object": dict,
        }
        
        if expected_type and expected_type in type_map:
            python_type = type_map[expected_type]
            if not isinstance(value, python_type):
                errors.append(
                    f"Parameter '{name}' must be {expected_type}, "
                    f"got {type(value).__name__}"
                )
        
        # Check enum
        enum_values = schema.get("enum")
        if enum_values and value not in enum_values:
            errors.append(
                f"Parameter '{name}' must be one of: {enum_values}"
            )
        
        return errors


# Singleton instance
_validation_service: Optional[ValidationService] = None


def get_validation_service() -> ValidationService:
    """Get or create the validation service singleton"""
    global _validation_service
    if _validation_service is None:
        _validation_service = ValidationService()
    return _validation_service

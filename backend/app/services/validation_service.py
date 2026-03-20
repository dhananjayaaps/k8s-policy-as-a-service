"""
Validation Service

Validates Kyverno policies against schemas and best practices.
"""

import yaml
import re
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

# RFC 1123 subdomain: lowercase alphanumeric, hyphens, max 253 chars
K8S_NAME_PATTERN = re.compile(r'^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$')
K8S_NAME_MAX_LENGTH = 253


def validate_k8s_name(name: str) -> Optional[str]:
    """Validate a Kubernetes resource name (RFC 1123 subdomain)."""
    if not name:
        return "Name cannot be empty"
    if len(name) > K8S_NAME_MAX_LENGTH:
        return f"Name must be {K8S_NAME_MAX_LENGTH} characters or fewer (got {len(name)})"
    if not K8S_NAME_PATTERN.match(name):
        return (
            f"Invalid name '{name}': must consist of lowercase alphanumeric characters, "
            "'-' or '.', and must start and end with an alphanumeric character"
        )
    return None


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
        else:
            name_error = validate_k8s_name(metadata["name"])
            if name_error:
                result["valid"] = False
                result["errors"].append(f"metadata.name: {name_error}")
        
        # Warn if ClusterPolicy has namespace set (it's cluster-scoped)
        if kind == "ClusterPolicy" and metadata.get("namespace"):
            result["warnings"].append(
                "ClusterPolicy is cluster-scoped and should not have a namespace in metadata"
            )
        
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
        else:
            match_block = rule["match"]
            if isinstance(match_block, dict):
                # Validate match block has at least one selector
                valid_match_keys = {"resources", "any", "all", "subjects", "roles", "clusterRoles"}
                if not any(k in match_block for k in valid_match_keys):
                    result["warnings"].append(
                        f"{rule_prefix}: 'match' block should contain at least one of: "
                        f"{', '.join(sorted(valid_match_keys))}"
                    )
                # Validate resources block if present
                resources = match_block.get("resources")
                if isinstance(resources, dict):
                    valid_resource_keys = {"kinds", "names", "namespaces", "selector", "annotations", "operations"}
                    if "kinds" not in resources:
                        result["warnings"].append(
                            f"{rule_prefix}: match.resources should specify 'kinds' to target"
                        )
        
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

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

# Pattern for Jinja2 template expressions: {{ var }}, {{ var | filter }}, {% %}, {# #}
JINJA2_EXPR_PATTERN = re.compile(r'\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\}')


def _substitute_jinja2_placeholders(yaml_content: str) -> str:
    """
    Replace Jinja2 template expressions with YAML-safe placeholder values
    so that yaml.safe_load can parse the template for structural validation.

    Uses an unquoted alphanumeric placeholder so it stays valid whether the
    expression appears bare, inside quotes, or as part of a larger string.
    """
    return JINJA2_EXPR_PATTERN.sub('PLACEHOLDER', yaml_content)


def _has_jinja2_syntax(yaml_content: str) -> bool:
    """Check if the YAML content contains Jinja2 template syntax."""
    return bool(JINJA2_EXPR_PATTERN.search(yaml_content))


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
        Handles Jinja2 template expressions by substituting placeholders.
        
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
        
        # Substitute Jinja2 template expressions before parsing
        parse_content = yaml_content
        has_templates = _has_jinja2_syntax(yaml_content)
        if has_templates:
            parse_content = _substitute_jinja2_placeholders(yaml_content)
            result["warnings"].append(
                "YAML contains template variables ({{ ... }}). "
                "Structure validated with placeholder values."
            )
        
        try:
            docs = list(yaml.safe_load_all(parse_content))
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
        
        # Carry over warnings from YAML validation
        result["warnings"].extend(yaml_result.get("warnings", []))
        
        # Substitute Jinja2 placeholders for structural validation
        parse_content = policy_yaml
        if _has_jinja2_syntax(policy_yaml):
            parse_content = _substitute_jinja2_placeholders(policy_yaml)
        
        try:
            policy = yaml.safe_load(parse_content)
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

    def test_resource_against_policy(
        self,
        policy_yaml: str,
        resource_yaml: str,
    ) -> Dict[str, Any]:
        """
        Test a Kubernetes resource YAML against a Kyverno policy.

        Returns a dict with per-rule results indicating pass/fail/skip.
        """
        result: Dict[str, Any] = {
            "success": True,
            "policy_valid": True,
            "resource_valid": True,
            "policy_errors": [],
            "resource_errors": [],
            "results": [],
            "summary": {"pass": 0, "fail": 0, "skip": 0, "warn": 0},
        }

        # ---------- parse policy ----------
        try:
            policy = yaml.safe_load(policy_yaml)
            if not isinstance(policy, dict):
                result["policy_valid"] = False
                result["policy_errors"].append("Policy YAML must be a mapping")
                result["success"] = False
                return result
        except yaml.YAMLError as e:
            result["policy_valid"] = False
            result["policy_errors"].append(f"Invalid policy YAML: {e}")
            result["success"] = False
            return result

        # quick structural check
        pol_validation = self.validate_policy(policy_yaml)
        if not pol_validation["valid"]:
            result["policy_valid"] = False
            result["policy_errors"] = pol_validation["errors"]
            result["success"] = False
            return result
        result["policy_errors"] = pol_validation.get("warnings", [])

        # ---------- parse resource ----------
        try:
            resource = yaml.safe_load(resource_yaml)
            if not isinstance(resource, dict):
                result["resource_valid"] = False
                result["resource_errors"].append("Resource YAML must be a mapping")
                result["success"] = False
                return result
        except yaml.YAMLError as e:
            result["resource_valid"] = False
            result["resource_errors"].append(f"Invalid resource YAML: {e}")
            result["success"] = False
            return result

        # basic resource checks
        res_kind = resource.get("kind")
        if not res_kind:
            result["resource_valid"] = False
            result["resource_errors"].append("Resource must have a 'kind' field")
            result["success"] = False
            return result

        res_api = resource.get("apiVersion", "")
        res_ns = (resource.get("metadata") or {}).get("namespace", "default")
        res_name = (resource.get("metadata") or {}).get("name", "")
        res_labels = (resource.get("metadata") or {}).get("labels", {}) or {}

        # ---------- iterate rules ----------
        spec = policy.get("spec", {})
        rules = spec.get("rules", [])
        failure_action = spec.get("validationFailureAction", "Audit").lower()

        for rule in rules:
            rule_name = rule.get("name", "unnamed")
            rule_result = self._test_rule(
                rule, res_kind, res_api, res_ns, res_name, res_labels, resource, failure_action
            )
            result["results"].append(rule_result)
            result["summary"][rule_result["status"]] = (
                result["summary"].get(rule_result["status"], 0) + 1
            )

        return result

    # ---- helpers for test_resource ----

    def _test_rule(
        self,
        rule: Dict[str, Any],
        res_kind: str,
        res_api: str,
        res_ns: str,
        res_name: str,
        res_labels: Dict[str, str],
        resource: Dict[str, Any],
        failure_action: str,
    ) -> Dict[str, Any]:
        """Test a single rule against a resource."""
        rule_name = rule.get("name", "unnamed")
        action_type = None
        for act in ("validate", "mutate", "generate", "verifyImages"):
            if act in rule:
                action_type = act
                break

        # --- match check ---
        match_block = rule.get("match", {})
        matched = self._matches(match_block, res_kind, res_api, res_ns, res_name, res_labels)

        # --- exclude check ---
        exclude_block = rule.get("exclude")
        if exclude_block and matched:
            excluded = self._matches(exclude_block, res_kind, res_api, res_ns, res_name, res_labels)
            if excluded:
                return {
                    "rule_name": rule_name,
                    "matched": False,
                    "status": "skip",
                    "message": "Resource is excluded from this rule",
                    "action_type": action_type,
                }

        if not matched:
            return {
                "rule_name": rule_name,
                "matched": False,
                "status": "skip",
                "message": "Resource does not match this rule's criteria (kind, namespace, or labels)",
                "action_type": action_type,
            }

        # --- evaluate action ---
        if action_type == "validate":
            return self._evaluate_validate(rule, resource, rule_name, failure_action)
        elif action_type == "mutate":
            return {
                "rule_name": rule_name,
                "matched": True,
                "status": "warn",
                "message": "This mutate rule would modify the resource (mutations are applied at admission time)",
                "action_type": "mutate",
            }
        elif action_type == "generate":
            return {
                "rule_name": rule_name,
                "matched": True,
                "status": "warn",
                "message": "This generate rule would create additional resources",
                "action_type": "generate",
            }
        elif action_type == "verifyImages":
            images = self._extract_images(resource)
            if images:
                return {
                    "rule_name": rule_name,
                    "matched": True,
                    "status": "warn",
                    "message": f"Image verification would apply to: {', '.join(images)}",
                    "action_type": "verifyImages",
                }
            return {
                "rule_name": rule_name,
                "matched": True,
                "status": "pass",
                "message": "No container images found to verify",
                "action_type": "verifyImages",
            }
        else:
            return {
                "rule_name": rule_name,
                "matched": True,
                "status": "skip",
                "message": "Rule has no recognized action type",
                "action_type": None,
            }

    def _matches(
        self,
        match_block: Dict[str, Any],
        res_kind: str,
        res_api: str,
        res_ns: str,
        res_name: str,
        res_labels: Dict[str, str],
    ) -> bool:
        """Check if a resource matches a match/exclude block."""
        if not match_block:
            return True

        # handle 'any'/'all' style
        any_rules = match_block.get("any")
        all_rules = match_block.get("all")
        if any_rules:
            return any(
                self._matches_single(r, res_kind, res_api, res_ns, res_name, res_labels)
                for r in any_rules
            )
        if all_rules:
            return all(
                self._matches_single(r, res_kind, res_api, res_ns, res_name, res_labels)
                for r in all_rules
            )

        # direct resources block
        return self._matches_single(match_block, res_kind, res_api, res_ns, res_name, res_labels)

    def _matches_single(
        self,
        block: Dict[str, Any],
        res_kind: str,
        res_api: str,
        res_ns: str,
        res_name: str,
        res_labels: Dict[str, str],
    ) -> bool:
        """Check a single match condition."""
        resources = block.get("resources", {})
        if not resources:
            return True

        # kinds
        kinds = resources.get("kinds", [])
        if kinds:
            kind_matched = False
            for k in kinds:
                if "/" in k:
                    # group/kind  e.g. apps/v1/Deployment
                    parts = k.rsplit("/", 1)
                    if parts[-1] == res_kind:
                        kind_matched = True
                        break
                elif k == res_kind:
                    kind_matched = True
                    break
                elif k == "*":
                    kind_matched = True
                    break
            if not kind_matched:
                return False

        # namespaces
        namespaces = resources.get("namespaces", [])
        if namespaces and res_ns not in namespaces:
            return False

        # names
        names = resources.get("names", [])
        if names and res_name not in names and "*" not in names:
            return False

        # selector (matchLabels)
        selector = resources.get("selector", {})
        match_labels = selector.get("matchLabels", {})
        for lk, lv in match_labels.items():
            if res_labels.get(lk) != lv:
                return False

        return True

    def _evaluate_validate(
        self,
        rule: Dict[str, Any],
        resource: Dict[str, Any],
        rule_name: str,
        failure_action: str,
    ) -> Dict[str, Any]:
        """Evaluate a validate rule against a resource."""
        validate = rule.get("validate", {})
        message = validate.get("message", "Validation failed")

        # deny rules
        if "deny" in validate:
            # Simple deny – always fails when matched
            deny = validate["deny"]
            conditions = deny.get("conditions") if isinstance(deny, dict) else None
            if conditions:
                return {
                    "rule_name": rule_name,
                    "matched": True,
                    "status": "warn",
                    "message": f"Deny rule with conditions: {message}",
                    "action_type": "validate",
                }
            return {
                "rule_name": rule_name,
                "matched": True,
                "status": "fail",
                "message": message,
                "action_type": "validate",
            }

        # pattern / anyPattern
        pattern = validate.get("pattern")
        any_pattern = validate.get("anyPattern")

        if pattern:
            ok = self._match_pattern(pattern, resource)
            status = "pass" if ok else ("fail" if failure_action == "enforce" else "warn")
            return {
                "rule_name": rule_name,
                "matched": True,
                "status": status,
                "message": message if not ok else "Resource matches the required pattern",
                "action_type": "validate",
            }

        if any_pattern:
            ok = any(self._match_pattern(p, resource) for p in any_pattern)
            status = "pass" if ok else ("fail" if failure_action == "enforce" else "warn")
            return {
                "rule_name": rule_name,
                "matched": True,
                "status": status,
                "message": message if not ok else "Resource matches one of the allowed patterns",
                "action_type": "validate",
            }

        # CEL / other advanced – can't fully evaluate
        return {
            "rule_name": rule_name,
            "matched": True,
            "status": "warn",
            "message": f"Rule uses advanced validation that requires a live cluster to evaluate: {message}",
            "action_type": "validate",
        }

    def _match_pattern(self, pattern: Any, value: Any, path: str = "") -> bool:
        """Recursively match a Kyverno pattern against a value."""
        if isinstance(pattern, dict):
            if not isinstance(value, dict):
                return False
            for pk, pv in pattern.items():
                # skip Kyverno operators for now except basic matching
                if pk.startswith("(") or pk.startswith("X("):
                    continue
                child = value.get(pk)
                if child is None:
                    # pattern key missing in resource
                    return False
                if not self._match_pattern(pv, child, f"{path}.{pk}"):
                    return False
            return True
        elif isinstance(pattern, list):
            if not isinstance(value, list):
                return False
            # each pattern item must match at least one value item
            for pi in pattern:
                found = any(self._match_pattern(pi, vi) for vi in value)
                if not found:
                    return False
            return True
        elif isinstance(pattern, str):
            s_val = str(value) if value is not None else ""
            # handle wildcard / negation patterns
            if pattern == "*":
                return True
            if pattern.startswith("!"):
                return s_val != pattern[1:]
            if pattern.startswith(">=") or pattern.startswith("<=") or pattern.startswith(">") or pattern.startswith("<"):
                return True  # numeric comparisons need more context
            return s_val == pattern
        else:
            return value == pattern

    def _extract_images(self, resource: Dict[str, Any]) -> List[str]:
        """Extract container image references from a K8s resource."""
        images: List[str] = []
        spec = resource.get("spec", {})
        # Pod spec can be nested (Deployment -> spec.template.spec)
        pod_spec = spec
        if "template" in spec:
            pod_spec = spec["template"].get("spec", {})

        for container_key in ("containers", "initContainers", "ephemeralContainers"):
            for c in pod_spec.get(container_key, []):
                img = c.get("image")
                if img:
                    images.append(img)
        return images


# Singleton instance
_validation_service: Optional[ValidationService] = None


def get_validation_service() -> ValidationService:
    """Get or create the validation service singleton"""
    global _validation_service
    if _validation_service is None:
        _validation_service = ValidationService()
    return _validation_service

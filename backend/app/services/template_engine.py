"""
Template Engine Service

Handles Kyverno policy template rendering using Jinja2.
"""

from jinja2 import Environment, BaseLoader, TemplateError
from typing import Dict, Any, Optional
import yaml
import logging

logger = logging.getLogger(__name__)


class TemplateEngine:
    """
    Template engine for rendering Kyverno policy templates.
    Uses Jinja2 for templating with YAML-safe output.
    """
    
    def __init__(self):
        self._env = Environment(
            loader=BaseLoader(),
            autoescape=False,  # We're dealing with YAML, not HTML
            trim_blocks=True,
            lstrip_blocks=True,
        )
        
        # Add custom filters
        self._env.filters["yaml_quote"] = self._yaml_quote
        self._env.filters["yaml_list"] = self._yaml_list
    
    @staticmethod
    def _yaml_quote(value: str) -> str:
        """Quote a string for YAML"""
        if any(c in value for c in ":#{}[]&*!|>'\"%@`"):
            return f'"{value}"'
        return value
    
    @staticmethod
    def _yaml_list(values: list, indent: int = 0) -> str:
        """Convert a list to YAML list format"""
        prefix = " " * indent
        return "\n".join(f"{prefix}- {v}" for v in values)
    
    def render(
        self, 
        template: str, 
        parameters: Dict[str, Any],
        validate: bool = True
    ) -> str:
        """
        Render a policy template with the given parameters.
        
        Args:
            template: Jinja2 template string (YAML format)
            parameters: Dictionary of parameter values
            validate: Whether to validate the output YAML
            
        Returns:
            Rendered YAML string
            
        Raises:
            TemplateError: If template rendering fails
            yaml.YAMLError: If output is not valid YAML
        """
        try:
            # Create template from string
            jinja_template = self._env.from_string(template)
            
            # Render with parameters
            rendered = jinja_template.render(**parameters)
            
            # Validate YAML if requested
            if validate:
                yaml.safe_load(rendered)
            
            return rendered
            
        except TemplateError as e:
            logger.error(f"Template rendering failed: {e}")
            raise
        except yaml.YAMLError as e:
            logger.error(f"Invalid YAML output: {e}")
            raise
    
    def extract_parameters(self, template: str) -> Dict[str, Any]:
        """
        Extract parameter placeholders from a template.
        
        This is a simple extraction that finds {{ variable }} patterns.
        For more complex templates, consider using AST parsing.
        
        Args:
            template: Jinja2 template string
            
        Returns:
            Dictionary of parameter names with None values
        """
        import re
        
        # Find all {{ variable }} patterns
        pattern = r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}"
        matches = re.findall(pattern, template)
        
        # Remove duplicates and Jinja2 built-ins
        builtins = {"loop", "self", "super", "varargs", "kwargs"}
        params = {m: None for m in matches if m not in builtins}
        
        return params
    
    def validate_template(self, template: str) -> Dict[str, Any]:
        """
        Validate a template for syntax errors.
        
        Args:
            template: Jinja2 template string
            
        Returns:
            Dictionary with validation results
        """
        result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "parameters": {},
        }
        
        try:
            # Try to parse the template
            self._env.parse(template)
            
            # Extract parameters
            result["parameters"] = self.extract_parameters(template)
            
        except TemplateError as e:
            result["valid"] = False
            result["errors"].append(str(e))
        
        # Check if base YAML is valid (with placeholder values)
        try:
            params = {k: "placeholder" for k in result["parameters"]}
            rendered = self.render(template, params, validate=True)
        except yaml.YAMLError as e:
            result["warnings"].append(f"YAML validation failed: {e}")
        except TemplateError:
            pass  # Already captured above
        
        return result


# Singleton instance
_engine_instance: Optional[TemplateEngine] = None


def get_template_engine() -> TemplateEngine:
    """Get or create the template engine singleton"""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = TemplateEngine()
    return _engine_instance

"""
Report Generator Service

Generates compliance reports from policy violations and audit data.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class ReportGenerator:
    """
    Service for generating compliance and policy reports.
    """
    
    def __init__(self):
        pass
    
    def generate_compliance_report(
        self,
        cluster_name: str,
        policies: List[Dict[str, Any]],
        violations: List[Dict[str, Any]],
        include_passed: bool = True,
        include_failed: bool = True,
    ) -> Dict[str, Any]:
        """
        Generate a compliance report for a cluster.
        
        Args:
            cluster_name: Name of the cluster
            policies: List of policies deployed to the cluster
            violations: List of policy violations
            include_passed: Include passed policies in report
            include_failed: Include failed policies in report
            
        Returns:
            Compliance report dictionary
        """
        report = {
            "cluster_name": cluster_name,
            "generated_at": datetime.utcnow().isoformat(),
            "summary": {
                "total_policies": len(policies),
                "passed": 0,
                "failed": 0,
                "warnings": 0,
            },
            "details": [],
        }
        
        # Create violation lookup by policy name
        violation_lookup = {}
        for v in violations:
            policy_name = v.get("policy_name")
            if policy_name not in violation_lookup:
                violation_lookup[policy_name] = []
            violation_lookup[policy_name].append(v)
        
        # Process each policy
        for policy in policies:
            policy_name = policy.get("name")
            policy_violations = violation_lookup.get(policy_name, [])
            
            status = "passed" if not policy_violations else "failed"
            
            # Update summary
            if status == "passed":
                report["summary"]["passed"] += 1
            else:
                report["summary"]["failed"] += 1
            
            # Add to details if requested
            if (status == "passed" and include_passed) or \
               (status == "failed" and include_failed):
                report["details"].append({
                    "policy_name": policy_name,
                    "status": status,
                    "violation_count": len(policy_violations),
                    "violations": policy_violations if status == "failed" else [],
                })
        
        return report
    
    def generate_policy_report(
        self,
        policy: Dict[str, Any],
        deployments: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Generate a report for a single policy across all deployments.
        
        Args:
            policy: Policy information
            deployments: List of deployments for this policy
            
        Returns:
            Policy report dictionary
        """
        report = {
            "policy_name": policy.get("name"),
            "policy_category": policy.get("category"),
            "generated_at": datetime.utcnow().isoformat(),
            "summary": {
                "total_deployments": len(deployments),
                "active": 0,
                "pending": 0,
                "failed": 0,
            },
            "deployments": [],
        }
        
        for deployment in deployments:
            status = deployment.get("status", "unknown")
            
            if status == "deployed":
                report["summary"]["active"] += 1
            elif status == "pending":
                report["summary"]["pending"] += 1
            elif status == "failed":
                report["summary"]["failed"] += 1
            
            report["deployments"].append({
                "cluster_id": deployment.get("cluster_id"),
                "namespace": deployment.get("namespace"),
                "status": status,
                "deployed_at": deployment.get("deployed_at"),
                "error_message": deployment.get("error_message"),
            })
        
        return report
    
    def generate_cluster_summary(
        self,
        cluster_info: Dict[str, Any],
        policies: List[Dict[str, Any]],
        kyverno_status: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Generate a summary report for a cluster.
        
        Args:
            cluster_info: Cluster information from K8s
            policies: List of deployed policies
            kyverno_status: Kyverno installation status
            
        Returns:
            Cluster summary dictionary
        """
        return {
            "generated_at": datetime.utcnow().isoformat(),
            "cluster": {
                "kubernetes_version": cluster_info.get("kubernetes_version"),
                "node_count": cluster_info.get("node_count"),
                "nodes": cluster_info.get("nodes", []),
            },
            "kyverno": {
                "installed": kyverno_status.get("installed", False),
                "version": kyverno_status.get("version"),
            },
            "policies": {
                "total": len(policies),
                "cluster_policies": len([
                    p for p in policies 
                    if p.get("kind") == "ClusterPolicy"
                ]),
                "namespaced_policies": len([
                    p for p in policies 
                    if p.get("kind") == "Policy"
                ]),
            },
        }
    
    def format_report_as_markdown(self, report: Dict[str, Any]) -> str:
        """
        Format a report as Markdown for display or export.
        
        Args:
            report: Report dictionary
            
        Returns:
            Markdown formatted string
        """
        lines = []
        
        # Title
        if "cluster_name" in report:
            lines.append(f"# Compliance Report: {report['cluster_name']}")
        elif "policy_name" in report:
            lines.append(f"# Policy Report: {report['policy_name']}")
        else:
            lines.append("# Report")
        
        lines.append(f"\nGenerated: {report.get('generated_at', 'N/A')}\n")
        
        # Summary
        if "summary" in report:
            lines.append("## Summary\n")
            summary = report["summary"]
            for key, value in summary.items():
                lines.append(f"- **{key.replace('_', ' ').title()}**: {value}")
            lines.append("")
        
        # Details
        if "details" in report:
            lines.append("## Details\n")
            for item in report["details"]:
                status_emoji = "✅" if item.get("status") == "passed" else "❌"
                lines.append(f"### {status_emoji} {item.get('policy_name', 'Unknown')}")
                lines.append(f"Status: {item.get('status', 'Unknown')}")
                
                if item.get("violations"):
                    lines.append("\n**Violations:**")
                    for v in item["violations"]:
                        lines.append(f"- {v.get('message', 'No message')}")
                lines.append("")
        
        return "\n".join(lines)


# Singleton instance
_report_generator: Optional[ReportGenerator] = None


def get_report_generator() -> ReportGenerator:
    """Get or create the report generator singleton"""
    global _report_generator
    if _report_generator is None:
        _report_generator = ReportGenerator()
    return _report_generator

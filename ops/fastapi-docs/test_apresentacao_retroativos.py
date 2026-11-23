"""Verifica a documentação consumida pelos agentes, sem executar jobs."""
import json
from pathlib import Path
import re
import unittest

from main import build_openapi_document


ROOT = Path(__file__).resolve().parents[2]
POLICY = Path(__file__).with_name("apresentacao-retroativos.md")


class RetroactivePresentationDocs(unittest.TestCase):
    def test_full_openapi_uses_the_single_policy(self):
        doc = build_openapi_document()
        policy = POLICY.read_text(encoding="utf-8")
        self.assertEqual(doc["info"]["description"].count(policy), 1)
        for heading in ("Regra", "Contra-regra", "Conferência antes da entrega"):
            self.assertIn("## " + heading, policy)
        link = doc["externalDocs"]
        self.assertTrue(link["url"].endswith("/main/" + str(POLICY.relative_to(ROOT))))
        for route in (
            "/api/insertions/{id}/capture-proof/jobs",
            "/api/internal/capture-proof-candidates/{candidateId}/audit",
            "/api/internal/capture-proof-candidates/{candidateId}/promote",
            "/api/pi-site-exports/jobs",
        ):
            self.assertEqual(doc["paths"][route]["post"]["externalDocs"], link)
        op = doc["paths"]["/api/insertions/{id}/capture-proof/jobs"]["post"]
        for example in op["requestBody"]["content"]["application/json"]["examples"].values():
            self.assertIs(example["value"]["candidate"], True)
            self.assertIs(example["value"]["promote"], False)

    def test_agent_and_ops_guide_resolve_the_canonical_file(self):
        for relative in ("AGENTS.md", "README.md", "docs/START_HERE_ADOPS.md",
                         "docs/prints-retroativos.md", "docs/adops/retroactive-recovery-harness.md",
                         "docs/adops/ops-api-runbook.md", "docs/adops/audit-checklist-api.md"):
            guide = ROOT / relative
            targets = re.findall(r"\]\(([^)]+apresentacao-retroativos\.md)\)", guide.read_text())
            self.assertEqual([(guide.parent / url).resolve() for url in targets], [POLICY], relative)
        ops = (ROOT / "artifacts/api-server/src/routes/ops.ts").read_text()
        self.assertIn(build_openapi_document()["externalDocs"]["url"], ops)
        start = ops.index('id: "gerar-print-data-especifica"')
        workflow = ops[start:ops.index('id: "gerar-retroativos-campanha"', start)]
        self.assertIn("retroPolicyUrl", workflow)
        request = re.search(r"-d '([^']+)'", workflow)
        self.assertIsNotNone(request)
        body = json.loads(request.group(1))
        self.assertIs(body["candidate"], True)
        self.assertIs(body["promote"], False)
        self.assertNotIn('command("print-single")', workflow)


if __name__ == "__main__":
    unittest.main()

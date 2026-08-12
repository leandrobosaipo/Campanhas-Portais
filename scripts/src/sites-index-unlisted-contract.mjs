const cod5_filterNeedle = ".filter((entry) => entry.isDirectory() && fs.existsSync(`${REPORTS_DIR}/${entry.name}/index.html`))";

const cod5_filterReplacement = `.filter((entry) => {
      if (!entry.isDirectory() || !fs.existsSync(\`${"${REPORTS_DIR}"}/\${entry.name}/index.html\`)) return false;
      const reportJsonPath = \`${"${REPORTS_DIR}"}/\${entry.name}/report.json\`;
      if (!fs.existsSync(reportJsonPath)) return true;
      try {
        const report = JSON.parse(fs.readFileSync(reportJsonPath, "utf8"));
        return report.visibility !== "unlisted";
      } catch {
        return true;
      }
    })`;

export function patchSitesIndexUnlisted(source) {
  const cod5_source = String(source || "");
  if (cod5_source.includes('return report.visibility !== "unlisted";')) return cod5_source;
  if (!cod5_source.includes(cod5_filterNeedle)) {
    throw new Error("Fonte não corresponde ao contrato de staticReports conhecido.");
  }
  return cod5_source.replace(cod5_filterNeedle, cod5_filterReplacement);
}

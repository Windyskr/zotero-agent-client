export interface TemplateVars {
  title: string;
  year: string;
  prompt: string;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*(title|year|prompt)\s*\}\}/g, (_match, key: keyof TemplateVars) => {
    return vars[key] ?? "";
  });
}

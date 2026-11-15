import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface BrandTemplate {
  id: string;
  name: string;
  logoPath?: string;
  logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  introVideoPath?: string;
  outroVideoPath?: string;
  callToAction?: string;
}

const BRAND_TEMPLATES_PATH = path.join(os.homedir(), '.kemi', 'brand-templates.json');

export async function loadBrandTemplates(): Promise<BrandTemplate[]> {
  try {
    if (fs.existsSync(BRAND_TEMPLATES_PATH)) {
      const content = await fs.promises.readFile(BRAND_TEMPLATES_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error loading brand templates:', error);
  }

  // Return default template
  return [{
    id: 'default',
    name: 'الافتراضي',
    primaryColor: '#3b82f6',
    secondaryColor: '#1d4ed8',
    fontFamily: 'Cairo'
  }];
}

export async function saveBrandTemplate(template: BrandTemplate): Promise<void> {
  const templates = await loadBrandTemplates();
  const existingIndex = templates.findIndex(t => t.id === template.id);

  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    templates.push(template);
  }

  await fs.promises.mkdir(path.dirname(BRAND_TEMPLATES_PATH), { recursive: true });
  await fs.promises.writeFile(BRAND_TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8');
}

export async function deleteBrandTemplate(templateId: string): Promise<void> {
  const templates = await loadBrandTemplates();
  const filtered = templates.filter(t => t.id !== templateId);

  await fs.promises.mkdir(path.dirname(BRAND_TEMPLATES_PATH), { recursive: true });
  await fs.promises.writeFile(BRAND_TEMPLATES_PATH, JSON.stringify(filtered, null, 2), 'utf-8');
}

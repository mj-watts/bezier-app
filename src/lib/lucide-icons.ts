import { iconNames } from 'lucide-react/dynamic';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

type LucideIconAttrValue = string | number | boolean;
type LucideIconNode = Array<[string, Record<string, LucideIconAttrValue>]>;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const attrsToString = (attrs: Record<string, LucideIconAttrValue>) =>
  Object.entries(attrs)
    .filter(([key]) => key !== 'key')
    .map(([key, val]) => `${key}="${escapeXml(String(val))}"`)
    .join(' ');

const iconNodeToSvg = (iconNode: LucideIconNode) => {
  const body = iconNode.map(([tag, attrs]) => `  <${tag} ${attrsToString(attrs)} />`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n${body}\n</svg>`;
};

export const lucideIconNames = [...iconNames].sort((a, b) => a.localeCompare(b));

export const loadLucideIconSvg = async (name: string): Promise<string | null> => {
  const importer = dynamicIconImports[name as keyof typeof dynamicIconImports];
  if (!importer) return null;

  const mod = (await importer()) as { __iconNode?: LucideIconNode };
  if (!Array.isArray(mod.__iconNode) || !mod.__iconNode.length) return null;
  return iconNodeToSvg(mod.__iconNode);
};

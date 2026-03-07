import { formatSvgCode } from './editor-core';

const SVG_FILTER = [{ name: 'SVG', extensions: ['svg'] }];

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const withSvgExtension = (filename: string) => {
  const trimmed = filename.trim() || 'drawing.svg';
  return /\.svg$/i.test(trimmed) ? trimmed : `${trimmed}.svg`;
};

const downloadSvgInBrowser = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const openSvgInBrowser = async (): Promise<string | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          cleanup();
          resolve(typeof reader.result === 'string' ? reader.result : null);
        };
        reader.onerror = () => {
          cleanup();
          resolve(null);
        };
        reader.readAsText(file);
      },
      { once: true },
    );

    input.click();
  });

export const saveSvgFile = async (codeText: string, filename: string) => {
  const content = formatSvgCode(codeText) || codeText;
  if (!content.trim()) return false;

  const safeName = withSvgExtension(filename);
  if (isTauriRuntime()) {
    const [{ save }, { invoke }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/core')]);
    const selectedPath = await save({
      defaultPath: safeName,
      filters: SVG_FILTER,
    });
    if (!selectedPath) return false;
    await invoke('write_text_file', { path: selectedPath, contents: content });
    return true;
  }

  downloadSvgInBrowser(content, safeName);
  return true;
};

export const openSvgFile = async (): Promise<string | null> => {
  if (isTauriRuntime()) {
    const [{ open }, { invoke }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/api/core')]);
    const selectedPath = await open({
      directory: false,
      multiple: false,
      filters: SVG_FILTER,
    });
    if (!selectedPath || Array.isArray(selectedPath)) return null;
    return invoke<string>('read_text_file', { path: selectedPath });
  }

  return openSvgInBrowser();
};

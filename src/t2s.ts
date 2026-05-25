import { T2S_MAP } from './t2sTable';

export function convertText(text: string): string {
  return text.replace(/./gsu, char => T2S_MAP[char] ?? char);
}

export function convertDoc(doc: Document): void {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node.textContent ?? '';
    const converted = convertText(t);
    if (converted !== t) node.textContent = converted;
  }
}

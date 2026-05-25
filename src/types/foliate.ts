export interface NavItem {
  id: string;
  href: string;
  label: string;
  subitems?: NavItem[];
  parent?: string;
}

export interface FoliateRenderer extends HTMLElement {
  setStyles?: (styles: string | string[]) => void;
  prev?: (distance?: number) => Promise<void>;
  next?: (distance?: number) => Promise<void>;
  reloadSection?: () => Promise<void>;
  getContents?: () => Array<{ doc: Document; index: number }>;
  readonly vertical?: boolean;
  flow?: string;
}

export interface FootnoteBeforeRenderDetail {
  view: FoliateViewElement;
}

export interface FootnoteRenderDetail {
  view: FoliateViewElement;
  contentHeight: number;
  href: string;
  type: string | null;
  hidden: boolean;
}

export interface FoliateLinkDetail {
  a: Element;
  href: string;
}

export interface FoliateBook {
  toc?: NavItem[];
}

export interface FoliateViewElement extends HTMLElement {
  book?: FoliateBook;
  renderer?: FoliateRenderer;
  open: (book: string | Blob | object) => Promise<void>;
  close: () => void;
  goTo: (target: string | number | object) => Promise<unknown>;
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  prev: (distance?: number) => Promise<void>;
  next: (distance?: number) => Promise<void>;
}

export interface FoliateRelocateDetail {
  fraction?: number;
  location?: { current?: number; total?: number };
  tocItem?: { href?: string; label?: string };
}

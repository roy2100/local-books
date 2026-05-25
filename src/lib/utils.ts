export interface Book {
  id: string;
  title: string;
  author: string;
  path: string;
  cover: string | null;
  added_at: number;
  source_folder: string | null;
}

export interface Library {
  books: Book[];
  folders: string[];
}

export function filterBooks(
  books: Book[],
  selectedFolder: string | null,
  search: string,
): Book[] {
  const q = search.toLowerCase();
  return books.filter((b) => {
    const inFolder = selectedFolder === null || b.source_folder === selectedFolder;
    const matchSearch =
      q === "" ||
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q);
    return inFolder && matchSearch;
  });
}

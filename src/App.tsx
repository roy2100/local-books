import "./App.css";
import Reader from "./reader/Reader";
import { Bookshelf } from "./components/Bookshelf";

// Reader window detection — injected by open_reader_window via initialization_script
const READER_BOOK_ID = (window as any).__READER_BOOK_ID__ as string | undefined;
const READER_BOOK_TITLE = (window as any).__READER_BOOK_TITLE__ as string | undefined;

export default function App() {
  if (READER_BOOK_ID && READER_BOOK_TITLE) {
    return <Reader bookId={READER_BOOK_ID} bookTitle={READER_BOOK_TITLE} />;
  }
  return <Bookshelf />;
}

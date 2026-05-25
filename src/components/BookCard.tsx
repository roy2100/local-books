import type { Book } from "../lib/utils";

interface Props {
  book: Book;
  onOpen: (book: Book) => void;
}

export function BookCard({ book, onOpen }: Props) {
  return (
    <div
      className="book-card"
      onDoubleClick={() => onOpen(book)}
    >
      <div className="book-cover">
        {book.cover ? (
          <img src={book.cover} alt={book.title} />
        ) : (
          <div className="book-cover-placeholder">
            <span className="book-cover-letter">
              {book.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="book-spine" />
      </div>
      <div className="book-info">
        <p className="book-title">{book.title}</p>
        <p className="book-author">{book.author}</p>
      </div>
    </div>
  );
}

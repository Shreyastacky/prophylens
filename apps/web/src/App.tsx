import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';

const examplePgn = `[Event "Example"]
[White "You"]
[Black "Training Partner"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *`;

export function App() {
  const [pgn, setPgn] = useState(examplePgn);

  const parsed = useMemo(() => {
    try {
      const game = new Chess();
      game.loadPgn(pgn, { strict: false });
      return { error: null, moves: game.history().length };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unable to parse PGN',
        moves: 0,
      };
    }
  }, [pgn]);

  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="ProphyLens home">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>ProphyLens</span>
        </a>
        <span className="status">Pre-alpha</span>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow">PRIVATE. TRANSPARENT. HUMAN-CALIBRATED.</div>
        <h1>
          See the threat before
          <br />
          it becomes a mistake.
        </h1>
        <p>
          ProphyLens is not another best-move machine. It finds the habits hiding across your
          completed games, shows whether your peers struggle too, and turns the right mistakes into
          practice.
        </p>
        <div className="promise-row" aria-label="Product principles">
          <span>Runs locally</span>
          <span>Evidence first</span>
          <span>No daily limit</span>
        </div>
      </section>

      <section className="workspace" aria-labelledby="import-heading">
        <div>
          <p className="step">01 / IMPORT</p>
          <h2 id="import-heading">Start with a finished game</h2>
          <p className="muted">
            This shell currently validates PGN locally. Engine analysis arrives only after the
            engine spike passes its responsiveness and reproducibility gates.
          </p>
        </div>
        <label className="pgn-field">
          <span>PGN</span>
          <textarea
            value={pgn}
            onChange={(event) => setPgn(event.target.value)}
            spellCheck="false"
          />
          <small className={parsed.error ? 'parse-error' : 'parse-ok'}>
            {parsed.error ?? `${parsed.moves} half-moves parsed locally`}
          </small>
        </label>
      </section>

      <section className="brain" aria-labelledby="brain-heading">
        <p className="step">THE BRAIN</p>
        <h2 id="brain-heading">Calculation is only the first layer.</h2>
        <div className="brain-grid">
          <article>
            <strong>01</strong>
            <h3>Stockfish</h3>
            <p>Objective lines, WDL, mates, and reproducible search evidence.</p>
          </article>
          <article>
            <strong>02</strong>
            <h3>Motifs</h3>
            <p>Pins, overloads, loose pieces, king safety, and concrete board changes.</p>
          </article>
          <article>
            <strong>03</strong>
            <h3>Peers</h3>
            <p>What rating-matched humans find, with samples and uncertainty attached.</p>
          </article>
          <article>
            <strong>04</strong>
            <h3>Coach</h3>
            <p>Recurring-pattern ranking, retry drills, and proof that the leak improved.</p>
          </article>
        </div>
      </section>

      <footer>
        <span>ProphyLens is for post-game study only.</span>
        <a href="https://github.com/Shreyastacky/prophylens" rel="noreferrer">
          AGPL-3.0-or-later
        </a>
      </footer>
    </main>
  );
}

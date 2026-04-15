# RegEx → NFA / DFA Visualizer

A browser-based tool that converts a regular expression into an **ε-NFA** and **DFA** using **Thompson's Construction** and **Subset (Powerset) Construction** algorithms — and lets you simulate input strings against the generated automaton in real time.

---

## ✨ Features

- **Regex Parser** — Recursive descent parser supporting `|`, `*`, `+`, `?`, `()`, and `ε`
- **ε-NFA Construction** — Thompson's Construction algorithm, visualized on an interactive canvas
- **DFA Construction** — Subset (powerset) construction from the ε-NFA
- **Transition Table** — Full DFA transition table with state type labels
- **String Simulation** — Animate step-by-step DFA execution on any input string
- **Interactive Canvas** — Pan (drag) and zoom (scroll or buttons) on both NFA and DFA graphs
- **No dependencies** — Pure HTML, CSS, and vanilla JavaScript; no build step required

---

## 📁 Project Structure

```
├── index.html    # HTML structure and layout
├── styles.css    # All styling (dark theme, grid, panels, canvas)
└── script.js     # Parser, automaton logic, canvas renderer, UI controls
```

---

## 🚀 Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/sekharsumansethi2-droid/regex-automata.git
   cd regex-automata
   ```

2. Open `index.html` directly in your browser — no server or install needed:
   ```bash
   open index.html        # macOS
   start index.html       # Windows
   xdg-open index.html    # Linux
   ```
3. Copy the click and open on a browser 
   ```bash
      https://sekharsumansethi2-droid.github.io/regex-automata/
   ```
---

## 🎮 How to Use

1. **Enter a regular expression** in the input field (e.g. `a(b|c)*`)
2. Click **Build Automaton** or press **Enter**
3. Switch between tabs to explore:
   - **ε-NFA** — Thompson's construction graph
   - **DFA** — Deterministic automaton graph
   - **Transition Table** — DFA state transition matrix
   - **Info** — Stats about the generated automaton
4. Use the **Simulate Input** panel to test strings — each character animates through the DFA

---

## 📐 Supported Syntax

| Operator | Meaning             | Example  |
|----------|---------------------|----------|
| `\|`     | Union / alternation | `a\|b`   |
| `*`      | Kleene star (0+)    | `a*`     |
| `+`      | One or more (1+)    | `a+`     |
| `?`      | Optional (0 or 1)   | `a?`     |
| `()`     | Grouping            | `(ab)+`  |
| `ε`      | Empty string        | `ε`      |

Concatenation is **implicit** (e.g. `ab` means `a` followed by `b`).  
Supported alphabet: `a–z`, `0–9`.

---

## 🧠 Algorithms Used

### Thompson's Construction
Converts a regex AST into an ε-NFA by recursively building NFA fragments for each operator. Each fragment has exactly one start and one accept state.

### Subset Construction
Converts the ε-NFA into a DFA by treating sets of NFA states as single DFA states, using ε-closure to track reachable states on each input symbol.

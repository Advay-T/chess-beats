// Library collections: shared by fetch-pgnmentor.js (what to download and select)
// and build-library.js (titles, categories, order on the games page).

const CATEGORIES = [
  { id: "champions", title: "World champions" },
  { id: "legends", title: "Legends" },
  { id: "women", title: "Women" },
  { id: "classics", title: "Classics" },
];

// Per-collection quotas: world champions are favoured over the other categories.
const QUOTA = { champions: 35, legends: 15, women: 20 };

// source: "book" (data/pgn file), "builtin" (games.js) or "pgnmentor" (players/<file>.zip).
// player: matches the collection's player in a White/Black tag ("Capablanca, Jose Raul").
const COLLECTIONS = [
  // ---- World champions ----
  { id: "steinitz", title: "Wilhelm Steinitz", subtitle: "World Champion 1886–1894", category: "champions", source: "pgnmentor", file: "Steinitz", player: /Steinitz/ },
  { id: "lasker", title: "Emanuel Lasker", subtitle: "World Champion 1894–1921", category: "champions", source: "pgnmentor", file: "Lasker", player: /Lasker,\s*Em/ },
  { id: "capablanca", title: "José Raúl Capablanca", subtitle: "World Champion 1921–1927", category: "champions", source: "pgnmentor", file: "Capablanca", player: /Capablanca/ },
  { id: "alekhine", title: "Alexander Alekhine", subtitle: "World Champion 1927–1935, 1937–1946", category: "champions", source: "pgnmentor", file: "Alekhine", player: /Alekhine|Aljechin/ },
  { id: "euwe", title: "Max Euwe", subtitle: "World Champion 1935–1937", category: "champions", source: "pgnmentor", file: "Euwe", player: /Euwe/ },
  { id: "botvinnik", title: "Mikhail Botvinnik", subtitle: "World Champion 1948–1957, 1958–1960, 1961–1963", category: "champions", source: "pgnmentor", file: "Botvinnik", player: /Botvinnik/ },
  { id: "smyslov", title: "Vasily Smyslov", subtitle: "World Champion 1957–1958", category: "champions", source: "pgnmentor", file: "Smyslov", player: /Smyslov/ },
  { id: "tal", title: "The Life and Games of Mikhail Tal", subtitle: "World Champion 1960–1961 · book, 1976", category: "champions", source: "book", file: "data/pgn/tal.pgn" },
  { id: "petrosian", title: "Tigran Petrosian", subtitle: "World Champion 1963–1969", category: "champions", source: "pgnmentor", file: "Petrosian", player: /Petrosian,\s*Tigran/ },
  { id: "spassky", title: "Boris Spassky", subtitle: "World Champion 1969–1972", category: "champions", source: "pgnmentor", file: "Spassky", player: /Spassky/ },
  { id: "fischer", title: "My 60 Memorable Games", subtitle: "Bobby Fischer, World Champion 1972–1975 · book, 1969", category: "champions", source: "book", file: "data/pgn/fischer-60.pgn" },
  { id: "karpov", title: "Anatoly Karpov", subtitle: "World Champion 1975–1985", category: "champions", source: "pgnmentor", file: "Karpov", player: /Karpov,\s*An/ },
  { id: "kasparov", title: "Garry Kasparov", subtitle: "World Champion 1985–2000", category: "champions", source: "pgnmentor", file: "Kasparov", player: /Kasparov,\s*G/ },
  { id: "kramnik", title: "Vladimir Kramnik", subtitle: "World Champion 2000–2007", category: "champions", source: "pgnmentor", file: "Kramnik", player: /Kramnik/ },
  { id: "anand", title: "Viswanathan Anand", subtitle: "World Champion 2007–2013", category: "champions", source: "pgnmentor", file: "Anand", player: /Anand/ },
  { id: "carlsen", title: "Magnus Carlsen", subtitle: "World Champion 2013–2023", category: "champions", source: "pgnmentor", file: "Carlsen", player: /Carlsen,\s*M/ },
  { id: "ding", title: "Ding Liren", subtitle: "World Champion 2023–2024", category: "champions", source: "pgnmentor", file: "Ding", player: /Ding,?\s*Liren|^Ding\b/ },
  { id: "gukesh", title: "Gukesh Dommaraju", subtitle: "World Champion 2024–", category: "champions", source: "pgnmentor", file: "Gukesh", player: /Gukesh/ },

  // ---- Legends ----
  { id: "morphy", title: "Paul Morphy", subtitle: "The world's best player of the 1850s", category: "legends", source: "pgnmentor", file: "Morphy", player: /Morphy/ },
  { id: "anderssen", title: "Adolf Anderssen", subtitle: "Romantic-era master, London 1851 winner", category: "legends", source: "pgnmentor", file: "Anderssen", player: /Anderssen/ },
  { id: "zukertort", title: "Johannes Zukertort", subtitle: "First World Championship challenger, 1886", category: "legends", source: "pgnmentor", file: "Zukertort", player: /Zukertort/ },
  { id: "pillsbury", title: "Harry Nelson Pillsbury", subtitle: "Hastings 1895 winner", category: "legends", source: "pgnmentor", file: "Pillsbury", player: /Pillsbury/ },
  { id: "tarrasch", title: "Siegbert Tarrasch", subtitle: "Title challenger, 1908", category: "legends", source: "pgnmentor", file: "Tarrasch", player: /Tarrasch/ },
  { id: "rubinstein", title: "Akiba Rubinstein", subtitle: "Pre-WWI contender, endgame great", category: "legends", source: "pgnmentor", file: "Rubinstein", player: /Rubinstein,\s*Ak/ },
  { id: "marshall", title: "Frank Marshall", subtitle: "US Champion 1909–1936", category: "legends", source: "pgnmentor", file: "Marshall", player: /Marshall,\s*F/ },
  { id: "nimzowitsch", title: "Aron Nimzowitsch", subtitle: "Author of My System", category: "legends", source: "pgnmentor", file: "Nimzowitsch", player: /Nimzowitsch|Nimzovich/ },
  { id: "reti", title: "Richard Réti", subtitle: "Hypermodern pioneer", category: "legends", source: "pgnmentor", file: "Reti", player: /Reti/ },
  { id: "keres", title: "Paul Keres", subtitle: "Four-time Candidates runner-up", category: "legends", source: "pgnmentor", file: "Keres", player: /Keres/ },
  { id: "bronstein", title: "David Bronstein", subtitle: "Title challenger, 1951", category: "legends", source: "pgnmentor", file: "Bronstein", player: /Bronstein,\s*D/ },
  { id: "korchnoi", title: "Viktor Korchnoi", subtitle: "Title challenger, 1978 and 1981", category: "legends", source: "pgnmentor", file: "Korchnoi", player: /Korchnoi|Kortschnoj/ },

  // ---- Women ----
  { id: "gaprindashvili", title: "Nona Gaprindashvili", subtitle: "Women's World Champion 1962–1978", category: "women", source: "pgnmentor", file: "Gaprindashvili", player: /Gaprindashvili/ },
  { id: "chiburdanidze", title: "Maia Chiburdanidze", subtitle: "Women's World Champion 1978–1991", category: "women", source: "pgnmentor", file: "Chiburdanidze", player: /Chiburdanidze/ },
  { id: "xie", title: "Xie Jun", subtitle: "Women's World Champion 1991–1996, 1999–2001", category: "women", source: "pgnmentor", file: "Xie", player: /Xie,?\s*Jun|^Xie\b/ },
  { id: "hou", title: "Hou Yifan", subtitle: "Women's World Champion, four titles 2010–2017", category: "women", source: "pgnmentor", file: "Hou", player: /Hou,?\s*Yifan|^Hou\b/ },
  { id: "polgarj", title: "Judit Polgar", subtitle: "The strongest woman player in history", category: "women", source: "pgnmentor", file: "PolgarJ", player: /Polgar,?\s*J/ },

  // ---- Classics ----
  { id: "classics", title: "Classics", subtitle: "Famous games", category: "classics", source: "builtin" },
];

module.exports = { CATEGORIES, QUOTA, COLLECTIONS };

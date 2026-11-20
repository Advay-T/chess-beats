// Built-in games. Loaded as a plain script (window.BUILTIN_GAMES) and via require() in tests.
(function (root) {
  var BUILTIN_GAMES = [
    {
      id: "immortal",
      title: "The Immortal Game (1851)",
      pgn: [
        '[Event "London casual game"]',
        '[Site "London ENG"]',
        '[Date "1851.06.21"]',
        '[White "Adolf Anderssen"]',
        '[Black "Lionel Kieseritzky"]',
        '[Result "1-0"]',
        "",
        "1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5",
        "8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8",
        "15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6",
        "21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0",
      ].join("\n"),
    },
    {
      id: "karpov-unzicker",
      title: "Karpov vs Unzicker (1974)",
      pgn: [
        '[Event "Nice Olympiad"]',
        '[Site "Nice FRA"]',
        '[Date "1974.06.10"]',
        '[White "Anatoly Karpov"]',
        '[Black "Wolfgang Unzicker"]',
        '[Result "1-0"]',
        "",
        "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6",
        "8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 Nc6 13. d5 Nd8 14. a4 Rb8",
        "15. axb5 axb5 16. b4 Nb7 17. Nf1 Bd7 18. Be3 Ra8 19. Qd2 Rfc8 20. Bd3 g6",
        "21. Ng3 Bf8 22. Ra2 c4 23. Bb1 Qd8 24. Ba7 Ne8 25. Bc2 Nc7 26. Rea1 Qe7",
        "27. Bb1 Be8 28. Ne2 Nd8 29. Nh2 Bg7 30. f4 f6 31. f5 g5 32. Bc2 Bf7 33. Ng3 Nb7",
        "34. Bd1 h6 35. Bh5 Qe8 36. Qd1 Nd8 37. Ra3 Kf8 38. R1a2 Kg8 39. Ng4 Kf8",
        "40. Ne3 Kg8 41. Bxf7+ Nxf7 42. Qh5 Nd8 43. Qg6 Kf8 44. Nh5 1-0",
      ].join("\n"),
    },
  ];

  if (typeof module !== "undefined" && module.exports) module.exports = BUILTIN_GAMES;
  else root.BUILTIN_GAMES = BUILTIN_GAMES;
})(this);

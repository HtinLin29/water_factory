export const themeInitScript = `
(function() {
  try {
    var theme = localStorage.getItem('wf-theme');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    var lang = localStorage.getItem('wf-language');
    if (lang === 'my') document.documentElement.lang = 'my';
  } catch (e) {}
})();
`;

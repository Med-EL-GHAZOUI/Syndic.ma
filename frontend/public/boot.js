// Applies the saved language/direction before first paint (kept external so a strict CSP can forbid inline scripts).
try {
  var l = localStorage.getItem('syndicma.lang') || 'fr';
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
} catch (e) {}

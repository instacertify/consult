document.getElementById('path-form')?.addEventListener('submit', function (e) {
  e.preventDefault();
  var sel = document.getElementById('path-select');
  if (!sel || !sel.value) return;
  window.location.href = sel.value;
});

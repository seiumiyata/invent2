function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('menu').style.display = (page === 'menu') ? '' : 'none';
  if (page !== 'menu') {
    document.getElementById(page).style.display = '';
  }
}

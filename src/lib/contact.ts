// Assembled at runtime so the address never appears verbatim in the HTML/JS for scrapers.
export const buildContactEmail = (): string => {
  const user = String.fromCharCode(116, 111, 112, 115, 114, 101, 107);
  const domain = ['gmail', 'com'].join('.');
  return [user, domain].join('@');
};

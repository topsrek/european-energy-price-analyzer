import { Button } from '@/components/ui/button';
import { buildContactEmail } from '@/lib/contact';

const ContactModal = () => {
  const openMail = () => {
    const subject = encodeURIComponent('European Energy Price Analyzer');
    window.location.href = `mailto:${buildContactEmail()}?subject=${subject}`;
  };

  return (
    <Button variant="link" className="text-gray-500 text-sm p-0 h-auto" onClick={openMail}>
      Kontakt
    </Button>
  );
};

export default ContactModal;

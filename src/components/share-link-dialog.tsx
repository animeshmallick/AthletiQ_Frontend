import { Check, Copy, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/overlays';
import { Input } from './ui/primitives';

/** Shows a one-time link (invite / password reset) with copy + WhatsApp share. */
export function ShareLinkDialog({
  link,
  onClose,
}: {
  link: {
    title: string;
    description: string;
    url: string;
    phone?: string | null;
    message: string;
  } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  const wa = `https://wa.me/${link.phone?.replace(/\D/g, '') ?? ''}?text=${encodeURIComponent(`${link.message}\n\n${link.url}`)}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link.title}</DialogTitle>
          <DialogDescription>{link.description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={link.url}
            onFocus={(e) => e.target.select()}
            aria-label="Link"
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy link"
            onClick={() => {
              void navigator.clipboard.writeText(link.url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button asChild variant="success">
            <a href={wa} target="_blank" rel="noreferrer">
              <MessageCircle /> Send on WhatsApp
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

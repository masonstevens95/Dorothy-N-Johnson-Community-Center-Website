/**
 * R5a is a content policy, not something code can enforce — no check can tell
 * whether a face is in a photo, and pretending otherwise would be worse than
 * saying so. The honest implementation is a visible reminder at the moment of
 * upload, and an explicit acknowledgement that the control is human.
 */
export function PhotoPolicyNotice() {
  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <p className="font-medium">Before you add a photo</p>
      <p className="mt-1 text-muted">
        Show spaces, structures, and finished work — garden beds, the mural, the
        room. <strong className="text-ink">No identifiable people.</strong> The
        center&rsquo;s projects involve residents and children, and this site has
        no media release or consent process behind it.
      </p>
      <p className="mt-2 text-muted">
        Location data is stripped from every photo automatically. Faces are not
        — that part is your judgement.
      </p>
    </div>
  );
}

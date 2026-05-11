import AgeConfirmButton from "./AgeConfirmButton";

/**
 * Visual shell for the 18+ confirmation gate.
 *
 * Phase 4: this is no longer mounted site-wide. It's still rendered by the
 * per-link interstitial at `/r/[linkId]` for sensitive links, and re-used
 * by `AgeGateInterstitial` (which passes a redirect target).
 */
export default function AgeGateScreen({
  redirectTo,
}: {
  redirectTo?: string;
} = {}) {
  return (
    <div
      style={{ backgroundColor: "#000", minHeight: "100vh" }}
      className="flex items-center justify-center px-6"
    >
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-white mb-3">18+ Verification</h1>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          This content is for adults only. Confirm you are 18 or older to continue.
        </p>
        <AgeConfirmButton redirectTo={redirectTo} />
      </div>
    </div>
  );
}

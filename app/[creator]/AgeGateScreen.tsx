import AgeConfirmButton from "./AgeConfirmButton";

export default function AgeGateScreen() {
  return (
    <div
      style={{ backgroundColor: "#000", minHeight: "100vh" }}
      className="flex items-center justify-center px-6"
    >
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-white mb-3">18+ Verification</h1>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          This site contains content for adults only. Confirm you are 18 or
          older to continue.
        </p>
        <AgeConfirmButton />
      </div>
    </div>
  );
}

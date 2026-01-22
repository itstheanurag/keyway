"use client";

export function HowItWorks() {
  const steps = [
    {
      step: 1,
      title: "Select your file",
      desc: "Drag and drop any file. It's encrypted instantly in your browser using a random key.",
    },
    {
      step: 2,
      title: "Share the secure link",
      desc: "A unique link is generated containing the decryption key. Send this to your recipient securely.",
    },
    {
      step: 3,
      title: "Direct transfer",
      desc: "When they open the link, a P2P connection is established. The encrypted file streams directly to them.",
    },
  ];

  return (
    <section className="bg-gray-50 py-32">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-4xl font-bold text-center text-gray-900 mb-20">
          How it works
        </h2>

        <div className="relative">
          <div className="absolute left-10 top-0 bottom-0 w-0.5 bg-gray-200 hidden md:block" />

          <div className="space-y-16">
            {steps.map((item, i) => (
              <div key={i} className="flex gap-10 relative">
                <div className="flex-shrink-0 w-20 h-20 rounded-3xl bg-white border border-gray-200 flex items-center justify-center shadow-sm z-10 text-3xl font-bold text-orange-500">
                  {item.step}
                </div>
                <div className="pt-2">
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">
                    {item.title}
                  </h3>
                  <p className="text-gray-500 leading-relaxed text-xl">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

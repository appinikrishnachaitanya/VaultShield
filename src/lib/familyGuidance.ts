import type { Stage } from "../types/privacy";

export const familyLanguages = {
  en: "English",
  hi: "हिन्दी",
  ta: "தமிழ்",
  mr: "मराठी",
} as const;
export type FamilyLanguage = keyof typeof familyLanguages;

const guidance = {
  en: {
    pause: "Pause. Don't send money or share a code.",
    pressure: "This message uses pressure. Verify the claim before acting.",
    check:
      "Call your family on a saved number or the bank using the number on your card.",
    reply:
      "I'll check this through the official channel before taking any action.",
    call: "I received a message asking me to pay. Did your organisation actually send this request? How can I verify it independently?",
  },
  hi: {
    pause: "रुकिए। पैसे मत भेजिए और कोई कोड साझा मत कीजिए।",
    pressure: "यह संदेश आप पर दबाव डाल रहा है। कोई कदम उठाने से पहले इसकी पुष्टि करें।",
    check:
      "परिवार के सदस्य को उनके सेव किए हुए नंबर पर या बैंक को कार्ड पर दिए नंबर पर फ़ोन करें।",
    reply: "मैं कोई कदम उठाने से पहले आधिकारिक माध्यम से इसकी पुष्टि करूँगा।",
    call: "मुझे पैसे भेजने का संदेश मिला है। क्या यह आपके यहाँ से आया है? मैं इसकी पुष्टि कैसे करूँ?",
  },
  ta: {
    pause: "சற்று நிறுத்துங்கள். பணம் அனுப்பாதீர்கள். எந்தக் குறியீட்டையும் பகிராதீர்கள்.",
    pressure:
      "இந்தச் செய்தி உங்களுக்கு அழுத்தம் கொடுக்கிறது. செயல்படுவதற்கு முன் அதைச் சரிபார்க்கவும்.",
    check:
      "குடும்பத்தினரைச் சேமித்த எண்ணில் அழையுங்கள் அல்லது வங்கி அட்டையிலுள்ள எண்ணை அழையுங்கள்.",
    reply: "எந்த நடவடிக்கையும் எடுப்பதற்கு முன் அதிகாரப்பூர்வ வழியில் இதைச் சரிபார்ப்பேன்.",
    call: "பணம் அனுப்புமாறு ஒரு செய்தி வந்தது. அதை உங்கள் நிறுவனம் அனுப்பியதா? அதை எப்படிச் சரிபார்ப்பது?",
  },
  mr: {
    pause: "थांबा. पैसे पाठवू नका आणि कोणताही कोड शेअर करू नका.",
    pressure: "हा संदेश तुमच्यावर दबाव टाकत आहे. कृती करण्यापूर्वी त्याची खात्री करा.",
    check:
      "कुटुंबातील व्यक्तीला जतन केलेल्या क्रमांकावर किंवा बँकेला कार्डवरील क्रमांकावर फोन करा.",
    reply: "कोणतीही कृती करण्यापूर्वी मी अधिकृत मार्गाने याची खात्री करेन.",
    call: "मला पैसे पाठवण्याचा संदेश आला. तो तुमच्या संस्थेने पाठवला आहे का? मी त्याची खात्री कशी करू?",
  },
};

export function familyGuidance(language: FamilyLanguage, stages: Stage[]) {
  const content = guidance[language];
  return {
    lines: [
      content.pause,
      ...(stages.some((stage) => stage.found) ? [content.pressure] : []),
      content.check,
    ],
    reply: content.reply,
    call: content.call,
  };
}

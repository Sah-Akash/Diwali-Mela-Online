export type StallTheme = 'kesari' | 'gulabi' | 'neela' | 'sindoori';

export type InteractableType =
  | 'food'
  | 'toy'
  | 'diya-craft'
  | 'partner'
  | 'balloon'
  | 'ring'
  | 'diya-game'
  | 'rangoli'
  | 'wheel'
  | 'carousel'
  | 'pirate-ship'
  | 'well'
  | 'stage'
  | 'daan-peti'
  | 'photo'
  | 'fireworks'
  | 'temple'
  | 'finale';

export interface RangoliColorSpec {
  id: string;
  name: string;
  hindi: string;
  hex: string;
}

export const RANGOLI_COLORS: RangoliColorSpec[] = [
  { id: 'kumkum', name: 'Kumkum Red', hindi: 'कुमकुम लाल', hex: '#e63946' },
  { id: 'haldi', name: 'Haldi Gold', hindi: 'हल्दी पीला', hex: '#ffb703' },
  { id: 'genda', name: 'Marigold Orange', hindi: 'गेंदा केसरी', hex: '#fb8500' },
  { id: 'gulabi', name: 'Rani Pink', hindi: 'रानी गुलाबी', hex: '#ff2a85' },
  { id: 'morpankh', name: 'Peacock Blue', hindi: 'मोरपंखी नीला', hex: '#00b4d8' },
  { id: 'panna', name: 'Mango Leaf Green', hindi: 'पन्ना हरा', hex: '#2ec4b6' },
  { id: 'jamuni', name: 'Royal Jamuni', hindi: 'जामुनी बैंगनी', hex: '#8338ec' },
  { id: 'safed', name: 'Chalk White', hindi: 'चावल सफ़ेद', hex: '#fff5de' },
];

export interface PartnerStallData {
  id: string;
  slotId: string;
  name: string;
  category: 'shop' | 'food' | 'creator';
  theme: StallTheme;
  plan: 'featured' | 'standard';
  greeting: string;
  question: string;
  answer: string;
  instagram?: string;
  productUrl?: string;
  whatsapp?: string;
  email?: string;
  isDemo?: boolean;
}

export interface MelaInteractableSpec {
  id: string;
  name: string;
  hindiSub: string;
  type: InteractableType;
  x: number;
  z: number;
  rotY: number;
  theme: StallTheme;
  greeting: string;
  description: string;
  choices?: {
    label: string;
    item?: string;
    reply: string;
    voiceLine?: string;
  }[];
  partner?: PartnerStallData;
}

export interface StallSlot {
  id: string;
  name: string;
  x: number;
  z: number;
  rotY: number;
}

export const STALL_SLOTS: StallSlot[] = [
  { id: 'entrance-west', name: 'Entrance · Left Lane', x: -12, z: 24, rotY: Math.PI / 2 },
  { id: 'entrance-east', name: 'Entrance · Right Lane', x: 12, z: 24, rotY: -Math.PI / 2 },
  { id: 'bazaar-west', name: 'Diwali Bazaar · Left Lane', x: -12, z: 4, rotY: Math.PI / 2 },
  { id: 'bazaar-east', name: 'Diwali Bazaar · Right Lane', x: 12, z: 4, rotY: -Math.PI / 2 },
  { id: 'rides-west', name: 'Towards Rides · Left Lane', x: -12, z: -16, rotY: Math.PI / 2 },
  { id: 'rides-east', name: 'Towards Rides · Right Lane', x: 12, z: -16, rotY: -Math.PI / 2 },
  { id: 'mandap-west', name: 'Near Laxmi-Ganesh Mandir · West', x: -20, z: -34, rotY: Math.PI / 3 },
  { id: 'wheel-east', name: 'Near Laxmi-Ganesh Mandir · East', x: 20, z: -34, rotY: -Math.PI / 3 },
];

export const THEME_COLORS: Record<StallTheme, { hex: number; css: string; label: string; accent: string }> = {
  kesari: { hex: 0xdc8827, css: '#dc8827', label: 'Kesari Marigold Gold', accent: '#ffd27d' },
  gulabi: { hex: 0xc83e6b, css: '#c83e6b', label: 'Gulabi Festive Pink', accent: '#ff9ebb' },
  neela: { hex: 0x1d7874, css: '#1d7874', label: 'Mayur Peacock Teal', accent: '#7ce0d6' },
  sindoori: { hex: 0xb8332a, css: '#b8332a', label: 'Sindoori Crimson', accent: '#ff9b85' },
};

export const DEFAULT_PARTNER_STALLS: PartnerStallData[] = [
  {
    id: 'partner-meera',
    slotId: 'entrance-west',
    name: "Meera's Handblock Studio",
    category: 'shop',
    theme: 'gulabi',
    plan: 'featured',
    greeting: 'Shubh Deepavali! Handblock Chanderi dupattas & festive table runners dekhiye—pure cotton aur zari border ke saath!',
    question: 'Diwali gift boxes mein kya special hai?',
    answer: 'Har gift box mein hand-printed dupatta, 2 scented soy diyas aur handwritten festive postcard aata hai!',
    instagram: 'https://www.instagram.com/meerashandblock',
    productUrl: 'https://example.com/meeras-handblock',
    isDemo: true,
  },
  {
    id: 'partner-noor',
    slotId: 'entrance-east',
    name: 'Noor Brassware & Urli',
    category: 'shop',
    theme: 'kesari',
    plan: 'featured',
    greeting: 'Aaiye ji! Moradabad ki asli pital ki urli, kamal diya aur Shubh-Labh hangings se ghar roshan karein.',
    question: 'Ye lotus brass urli kitne din mein deliver hoti hai?',
    answer: 'Pan-India express dispatch! Pure handcrafted heirloom brass jo har Diwali pe पीढ़ी-दर-पीढ़ी chamkega.',
    instagram: 'https://www.instagram.com/noorbrassware',
    productUrl: 'https://example.com/noor-brass',
    isDemo: true,
  },
  {
    id: 'partner-pahadi',
    slotId: 'bazaar-west',
    name: 'Pahadi Artisanal Mithai',
    category: 'food',
    theme: 'sindoori',
    plan: 'standard',
    greeting: 'Namaste! Khoya बर्फी, Pahadi Bal Mithai aur organic Gulkand dry-fruit hampers taste kijiye!',
    question: 'Kya sugar-free khajoor barfi bhi milti hai?',
    answer: 'Bilkul! Hamari Anjeer-Khajoor roll 100% zero refined sugar aur pure A2 Bilona ghee se banti hai.',
    instagram: 'https://www.instagram.com/pahadimithai',
    productUrl: 'https://example.com/pahadi-mithai',
    isDemo: true,
  },
  {
    id: 'partner-kalakriti',
    slotId: 'bazaar-east',
    name: 'KalaKriti Rangoli & Toran',
    category: 'creator',
    theme: 'neela',
    plan: 'standard',
    greeting: 'Happy Diwali! Ready-to-place wooden mandala rangoli mats aur marigold gotta-patti torans dekhiye!',
    question: 'Reusable rangoli kaise kaam karti hai?',
    answer: 'Acrylic aur MDF base par hand-painted kundan work hai—bas organic gulal bhariye aur 2 minute mein aangan taiyaar!',
    instagram: 'https://www.instagram.com/kalakritirangoli',
    productUrl: 'https://example.com/kalakriti',
    isDemo: true,
  },
];

export const CORE_MELA_ATTRACTIONS: MelaInteractableSpec[] = [
  // Entrance Welcome Carts: Ice Gola Thela & Glass Bangles / Mehendi Bazaar
  {
    id: 'food-gola',
    name: 'Kala Khatta Baraf Gola & Kulfi Thela',
    hindiSub: 'काला खट्टा बर्फ का गोला और मटका कुल्फी ठेला',
    type: 'food',
    x: -12,
    z: 42,
    rotY: Math.PI / 2,
    theme: 'gulabi',
    greeting:
      'Ting-ting! Bachpan wala Kala Khatta, Kaccha Aam aur Rose Baraf ka Gola! Upar se malai rabri aur chaat masala daal doon?',
    description:
      'Traditional wooden mela pushcart serving rainbow Kala Khatta ice golas and malai stick kulfi.',
    choices: [
      {
        label: 'Rainbow Kala Khatta Baraf Gola · Free',
        item: 'Kala Khatta Ice Gola',
        reply: 'Khatta-meetha Kala Khatta aur Rooh-Afza wala Baraf Gola! Zubaan rangin ho gayi na!',
      },
      {
        label: 'Kaccha Aam & Masala Chuski · Free',
        item: 'Kaccha Aam Chuski',
        reply: 'Chatpata kala namak aur kachi keri ki chuski—asli mela swaad!',
      },
    ],
  },
  {
    id: 'stall-bangles',
    name: 'Suhaag Kangan & Festive Mehendi Bazaar',
    hindiSub: 'सुहाग चूड़ी, कंगन और दिवाली मेहंदी',
    type: 'diya-craft',
    x: 12,
    z: 42,
    rotY: -Math.PI / 2,
    theme: 'sindoori',
    greeting:
      'Khan-khan karti Firozabad ki kaanch ki choodiyan,undan kangan aur rachi-rachi Diwali Mehendi! Apne ghar ke liye shubh shagun le jaaiye!',
    description:
      'Glittering rows of Firozabad glass bangles, golden lac kangans, and organic Rajasthani Mehendi cones.',
    choices: [
      {
        label: 'Firozabad Glass Choodi Set · Free',
        item: 'Resham Kaanch Choodi Set',
        reply: 'Laal, hare aur sunehre rang ki khanakti choodiyan aapke Mela Bag mein rakh di hain!',
      },
      {
        label: 'Rajasthani Diwali Mehendi Cone · Free',
        item: 'Shubh Diwali Mehendi',
        reply: 'Gehra laal rang rachega! Hatho mein sukh-samriddhi ki mehendi.',
      },
      {
        label: 'Kundan & Mirror-Work Kangan · Free',
        item: 'Kundan Kangan Pair',
        reply: 'Chamakte mirror-work wale shahi kangan—Shubh Deepavali!',
      },
    ],
  },

  // Food & Mithai Gali
  {
    id: 'food-mithai',
    name: 'Kaka Halwai Ki Shahi Mithai',
    hindiSub: 'काका हलवाई • काजू कतली और लड्डू',
    type: 'food',
    x: -12,
    z: 34,
    rotY: Math.PI / 2,
    theme: 'kesari',
    greeting: 'Shubh Deepavali! Chandi-warq wali Kaju Katli aur desi ghee ke Motichoor Ladoo—muh meetha kiye bina mela adhoora hai!',
    description: 'Fresh silver-leaf Kaju Katli, warm Motichoor Ladoo & Mawa Gujiya.',
    choices: [
      {
        label: 'Chandi-Warq Kaju Katli · Free',
        item: 'Kaju Katli Box',
        reply: 'Yeh lijiye taazi Kaju Katli! Muh mein ghul jaane wali Diwali mithaas.',
      },
      {
        label: 'Ghee ke Motichoor Ladoo · Free',
        item: 'Motichoor Ladoo',
        reply: 'Garma-garam kesar boondi ke ladoo! Shubh Deepavali!',
      },
      {
        label: 'Kesar Pista Mawa Gujiya · Free',
        item: 'Mawa Gujiya',
        reply: 'Khasta gujiya aur badam-elaichi ki khushboo—maza aa gaya na!',
      },
    ],
  },
  {
    id: 'food-jalebi',
    name: 'Garam Kesar Jalebi & Rabri',
    hindiSub: 'गरमा-गरम केसर जलेबी और रबड़ी',
    type: 'food',
    x: 12,
    z: 34,
    rotY: -Math.PI / 2,
    theme: 'sindoori',
    greeting: 'Kadhai se seedha chashni mein! Kurkuri kesar jalebi ke upar thandi-thandi lachedar rabri daal doon?',
    description: 'Crispy saffron jalebis piped fresh in sizzling ghee with thick rabri.',
    choices: [
      {
        label: 'Kesar Jalebi + Kullad Rabri · Free',
        item: 'Garam Jalebi & Rabri',
        reply: 'Aaha! Garam kurkuri jalebi aur thandi rabri ka joda—asli Diwali swarg!',
      },
      {
        label: 'Sirf Karak Lal Jalebi · Free',
        item: 'Karak Jalebi',
        reply: 'Ekdum kadak aur rasbhari jalebi! Ungliyaan chaat-te reh jaoge.',
      },
    ],
  },
  {
    id: 'food-chaat',
    name: 'Sharma Ji Ki Dilli Chaat',
    hindiSub: 'शर्मा जी की मशहूर चाट',
    type: 'food',
    x: -12,
    z: 14,
    rotY: Math.PI / 2,
    theme: 'gulabi',
    greeting: 'Sharma ji ki chaat! Papdi ki crunch, dahi ki thandak aur saunth ki mithaas—bolo, khatti-meethi ya teekhi chatpati?',
    description: 'Old Delhi style Dahi Bhalla Papdi Chaat & Tawa Aloo Tikki.',
    choices: [
      {
        label: 'Dahi Bhalla Papdi Chaat · Free',
        item: 'Dahi Bhalla Chaat',
        reply: 'Anaardana aur bhuna jeera daal ke banayi hai! Kha ke batao kaisi lagi.',
      },
      {
        label: 'Kurkuri Aloo Tikki Chole · Free',
        item: 'Aloo Tikki Chaat',
        reply: 'Tawa pe siki hui karari tikki, hari chutney ke saath—wah bhai wah!',
      },
    ],
  },
  {
    id: 'food-golgappe',
    name: 'Bambaiya Pani Puri & Golgappe',
    hindiSub: 'चटपटे गोलगप्पे • ६ स्वाद',
    type: 'food',
    x: 12,
    z: 14,
    rotY: -Math.PI / 2,
    theme: 'neela',
    greeting: 'Dona pakdo bhaiya! Hing-pudina ka teekha paani ya imli-gud ka meetha—kisse shuruwat karein?',
    description: 'Crisp suji & atta golgappe served with spiced mint and sweet tamarind water.',
    choices: [
      {
        label: 'Teekha Pudina Golgappe Plate · Free',
        item: 'Pani Puri Plate',
        reply: 'Ek aur! Aur last mein sukha मसाला पापड़ी bilkul muft!',
      },
      {
        label: 'Meethi Dahi Puri · Free',
        item: 'Bambaiya Dahi Puri',
        reply: 'Sev, dahi aur khajoor chutney se bhari hui Dahi Puri—dil khush ho gaya!',
      },
    ],
  },
  {
    id: 'food-kulfi',
    name: 'Matka Malai Kulfi & Thandai',
    hindiSub: 'मटका मलाई कुल्फी और केसर ठंडाई',
    type: 'food',
    x: -12,
    z: -6,
    rotY: Math.PI / 2,
    theme: 'kesari',
    greeting: 'Matke se nikli kesar-pista Malai Kulfi Falooda! Ya Diwali special badam-gulab Thandai piyoge?',
    description: 'Earthen pot saffron kulfi with rose falooda and almond thandai.',
    choices: [
      {
        label: 'Matka Kulfi Falooda · Free',
        item: 'Matka Malai Kulfi',
        reply: 'Rabri falooda aur rooh-afza ki laal boondein—bachpan ki yaad aa gayi na!',
      },
      {
        label: 'Kesar Badam Kulhad Thandai · Free',
        item: 'Kesar Thandai',
        reply: 'Pista, elaichi aur gulab ki pankhudiyon wali thandai—Shubh Deepavali!',
      },
    ],
  },
  {
    id: 'food-chai',
    name: 'Kulhad Chai & Candy Floss',
    hindiSub: 'कुल्हड़ मसाला चाय और हवा-मिठाई',
    type: 'food',
    x: 12,
    z: -6,
    rotY: -Math.PI / 2,
    theme: 'gulabi',
    greeting: 'Mela ghoomte-ghoomte thak gaye? Adrak-elaichi wali Kulhad Chai aur bachpan ki gulabi Hawa-Mithai le jao!',
    description: 'Smoky clay-cup masala chai, buttered popcorn, and pink spun sugar clouds.',
    choices: [
      {
        label: 'Adrak Elaichi Kulhad Chai · Free',
        item: 'Kulhad Masala Chai',
        reply: 'Sondhi mitti ki khushboo aur kadak elaichi chai—ek chuski mein thakan gayab!',
      },
      {
        label: 'Gulabi Candy Floss (Hawa-Mithai) · Free',
        item: 'Gulabi Candy Floss',
        reply: 'Baadal jaisi naram gulabi candy floss! Bachpan ka sabse pyara souvenir.',
      },
      {
        label: 'Garam Masala Popcorn · Free',
        item: 'Garam Popcorn',
        reply: 'Taaza makkhan aur haldi-namak wale garam popcorn!',
      },
    ],
  },

  // Souvenir & Toy Stalls
  {
    id: 'stall-toys',
    name: 'Khilone & Phuljhari Ki Dukaan',
    hindiSub: 'खिलौने, फुलझड़ी और कंदील',
    type: 'toy',
    x: -12,
    z: -26,
    rotY: Math.PI / 2,
    theme: 'sindoori',
    greeting: 'Aao bhaiya! Bina dhuein wali chamakti Golden Phuljhari, Aakash Kandil, aur Bachpan ke Mela Khilone—sab kuch free!',
    description: 'Interactive sparklers (Phuljhari), glowing lanterns, mela masks & bargaining fun.',
    choices: [
      {
        label: 'Hold a Lit Golden Phuljhari (Sparkler) · Free',
        item: 'Golden Phuljhari',
        reply: 'Yeh lo chamakti Phuljhari! Ab poore mele mein haath ghumaate hue roshni bikhero!',
      },
      {
        label: 'Satrangi Aakash Kandil Lantern · Free',
        item: 'Aakash Kandil',
        reply: 'Sone aur gulabi rang ka Diwali Kandil aapke mela jhole mein rakh diya!',
      },
      {
        label: 'Chamakti Mayur Bansuri · Free',
        item: 'Mayur Bansuri',
        reply: 'Mor-pankh wali bansuri! Mele ki sabse suhani yaad.',
      },
    ],
  },
  {
    id: 'stall-diya-craft',
    name: 'Kumhar Ka Diya & Terracotta',
    hindiSub: 'कुम्हार के मिट्टी के दीये और तोरण',
    type: 'diya-craft',
    x: 12,
    z: -26,
    rotY: -Math.PI / 2,
    theme: 'kesari',
    greeting: 'Chak par bane taaze mitti ke diyas, panchmukhi deepak aur gende ke phoolon ki toran—apne ghar ke liye le jaaiye!',
    description: 'Hand-spun earthen diyas, painted terracotta elephants, and marigold garlands.',
    choices: [
      {
        label: 'Panchmukhi Terracotta Diya Set · Free',
        item: 'Panchmukhi Diya',
        reply: 'Mitti ke diye se ghar mein sukh-shanti aur ujala bana rahe! Shubh Deepavali.',
      },
      {
        label: 'Gende Aur Aam-Patte Ki Toran · Free',
        item: 'Marigold Toran',
        reply: 'Taaze kesariya aur peele gende ki maala aapke jhole mein!',
      },
      {
        label: 'Shubh-Labh Painted Kalash · Free',
        item: 'Mangal Kalash',
        reply: 'Haath se ranga hua Mangal Kalash—aapki Diwali mangalmay ho!',
      },
    ],
  },

  // Interactive 3D Mela Games
  {
    id: 'game-balloon',
    name: 'Nishana Lagao · Balloon Shoot',
    hindiSub: 'निशाना लगाओ • ३ शॉट में इनाम',
    type: 'balloon',
    x: -24,
    z: 8,
    rotY: Math.PI / 2,
    theme: 'gulabi',
    greeting: 'Teen shot! Maar ke dikhao bhaiya! रंग-बिरंगे गुब्बारे फोड़ो और दिवाली टेडी इनाम ले जाओ!',
    description: 'Pop the bobbing balloons on the target board in 3 shots. Aim assist is on!',
  },
  {
    id: 'game-ring',
    name: 'Swarna Challa · Golden Ring Toss',
    hindiSub: 'छल्ला फेंको • जिस पर गिरे वो आपका!',
    type: 'ring',
    x: 24,
    z: 8,
    rotY: -Math.PI / 2,
    theme: 'neela',
    greeting: 'Paanch sunehre challe! Jis inaam par challa baithega, woh inaam aapka! Ek baar haath aazmao!',
    description: 'Toss 5 golden rings onto the Diwali gift pedestals and brass prizes.',
  },
  {
    id: 'game-diya',
    name: 'Deepotsav Mandap · Light 7 Diyas',
    hindiSub: 'दीपोत्सव मंडप • रंगोली के ७ दीये जलाएं',
    type: 'diya-game',
    x: 0,
    z: -10,
    rotY: 0,
    theme: 'kesari',
    greeting: 'Aaiye! Maha-Rangoli ke charon taraf 7 mitti ke diyon ko prajwalit karein aur Deepotsav Aashirwad praapt karein.',
    description: 'Tap each of the 7 earthen diyas around the central Rangoli Mandap to light their golden flames.',
  },
  {
    id: 'daan-peti',
    name: 'Seva Daan Peti · Charity Donation Box',
    hindiSub: 'सेवा दान पेटी • किसी गरीब के घर भी जले खुशियों का दीया',
    type: 'daan-peti',
    x: 5.6,
    z: -8.2,
    rotY: -Math.PI / 6,
    theme: 'kesari',
    greeting:
      'Apne ghar ke diye toh har koi jalata hai, asli Diwali toh tab hai jab aapki wajah se kisi gareeb ke ghar chulha jal paata hai. Scan the QR code to bring warm food, mithai, and smiles to a family in need tonight!',
    description:
      'Traditional brass-bound Daan Peti next to the 7 Diyas Mandap. Click to scan the QR code and help underprivileged families celebrate Diwali.',
  },
  {
    id: 'rangoli-art',
    name: 'Rangoli Aangan · Interactive Floor Art',
    hindiSub: 'रंगोली आँगन • अपने हाथों से दिवाली रंगोली सजाएं',
    type: 'rangoli',
    x: -6.2,
    z: -8.2,
    rotY: Math.PI / 6,
    theme: 'gulabi',
    greeting:
      'Aaiye! Rangoli ke bina Diwali adhoori hai! Choose vibrant gulal colors from the brass bowls and tap the petals on the floor to fill your auspicious Ashtadala Lotus Rangoli!',
    description:
      'Pick traditional gulal colors and click the pre-defined 3D mandala petals on the floor to create your own glowing Diwali Rangoli.',
  },

  // Rides & Cultural Stage
  {
    id: 'ride-wheel',
    name: 'Chand Wala Jhoola · Giant Wheel',
    hindiSub: 'चाँद वाला झूला • आसमान से मेला देखो',
    type: 'wheel',
    x: 28,
    z: -24,
    rotY: -Math.PI / 3,
    theme: 'kesari',
    greeting: 'Chand tak chaloge? Ek chakkar lagao—upar se hazaaron diyon aur kandilon se jagmagata poora Diwali Mela dikhega!',
    description: 'Board a glowing gondola and rise 28 meters above the illuminated fairgrounds.',
  },
  {
    id: 'ride-carousel',
    name: 'Ghode Wala Jhoola · Royal Carousel',
    hindiSub: 'घोड़े वाला झूला • बचपन का एक और चक्कर',
    type: 'carousel',
    x: -28,
    z: -16,
    rotY: Math.PI / 3,
    theme: 'gulabi',
    greeting: 'Shahi ghode pe baitho! Bachpan ki dhun aur ghoomti roshniyon ke beech ek suhana chakkar!',
    description: 'Ride a golden carousel horse inside the spinning mirror pavilion.',
  },
  {
    id: 'ride-ship',
    name: 'Mayur Samundari Jhoola',
    hindiSub: 'मयूर समुद्री झूला • हवा से बातें',
    type: 'pirate-ship',
    x: -28,
    z: -36,
    rotY: Math.PI / 4,
    theme: 'neela',
    greeting: 'Mayur Pankhi Kashti taiyaar hai! Aage-peechhe aasman chhoota hua ek romanchak jhoola chalega?',
    description: 'Swing high into the starry Diwali night aboard the giant Peacock Ship.',
  },
  {
    id: 'stage-ramleela',
    name: 'Ayodhya Deepotsav & Ram Leela Stage',
    hindiSub: 'राम लीला और अयोध्या दीपोत्सव मंच',
    type: 'stage',
    x: -24,
    z: -50,
    rotY: Math.PI / 5,
    theme: 'kesari',
    greeting: 'Aaiye विराजे! Shri Ram ke Ayodhya aagman aur Deepotsav Leela ka shahi manchan dekhein.',
    description: 'Watch the cultural Ram Leela & Ayodhya Deepotsav stage performance under the starry night.',
  },
  {
    id: 'ride-well',
    name: 'Maut Ka Kuan · Well of Death',
    hindiSub: 'मौत का कुआँ • देखो या खुद बाइक चलाओ!',
    type: 'well',
    x: 28,
    z: -48,
    rotY: -Math.PI / 4,
    theme: 'sindoori',
    greeting: 'Dhol baje, bike ghoome! Lakdi ki khadi deewar par stunt dekho, ya khud rider ban kar sunehre challe pakdo!',
    description: 'Watch the vertical wall motorcycle stunts from the top gallery or ride the wall yourself!',
  },

  // Photo Point, Fireworks & Grand Finale
  {
    id: 'photo-booth',
    name: 'Mela Chaloge Mere Sath? Photo Point',
    hindiSub: 'दीवाली सेल्फी पॉइंट • एक फोटो तो बनती है!',
    type: 'photo',
    x: 0,
    z: 22,
    rotY: 0,
    theme: 'gulabi',
    greeting: 'Gende ke phoolon aur diyon ke toran ke saamne ek yaadgar Diwali Mela postcard banao!',
    description: 'Frame your view and create a downloadable Diwali Mela souvenir postcard to share.',
  },
  {
    id: 'show-fireworks',
    name: 'Roshni Ka Jashn · Sky Crackers',
    hindiSub: 'रोशनी का जश्न • अनार, चकरी और आतिशबाज़ी',
    type: 'fireworks',
    x: 16,
    z: -50,
    rotY: -Math.PI / 6,
    theme: 'neela',
    greeting: 'Sirf roshni, sirf khushi! Anar ke fawware, ghoomti chakri aur satrangi aasmani aatishbaazi shuru karein!',
    description: 'Ignite golden Anar fountains and multi-color aerial sky bursts over the fair.',
  },
  {
    id: 'temple-laxmi-ganesh',
    name: 'Shri Laxmi-Ganesh Maha-Mandir',
    hindiSub: 'श्री लक्ष्मी-गणेश महा-मंदिर • भव्य दर्शन और आरती थाली',
    type: 'temple',
    x: 0,
    z: -34,
    rotY: 0,
    theme: 'kesari',
    greeting:
      'जय श्री गणेश! जय माँ लक्ष्मी! पधारिए भक्तजनों! इस भव्य मंदिर में विराजमान विशाल श्री लक्ष्मी-गणेश जी के दर्शन करें, मंदिर की घंटी बजाएं और पावन आरती थाली से महा-आरती उतारें!',
    description:
      'Grand towering Hindu Temple at the heart of the Mela featuring colossal idols of Maa Lakshmi and Lord Ganesha, an interactive Golden Aarti Thali, temple bells, Pushpanjali flower shower, and Mahaprasad.',
  },
  {
    id: 'finale-akashdeep',
    name: 'Maha Deepotsav & 1008 Akashdeep Finale',
    hindiSub: 'महा-दीपोत्सव • १००८ आकाशदीप और महा-आरती',
    type: 'finale',
    x: 0,
    z: -62,
    rotY: 0,
    theme: 'kesari',
    greeting: 'Tamaso Ma Jyotirgamaya! Swarna Deep-Stambh ko prajwalit karein aur aasman mein saikdon Akashdeep (sky lanterns) udate hue dekhein!',
    description: 'Trigger the breathtaking Grand Diwali Finale: lighting the giant Golden Deep-Stambh, releasing 100+ glowing sky lanterns, and the royal fireworks symphony.',
  },
];

const CUSTOM_STALLS_STORAGE_KEY = 'diwali-mela-custom-stalls-v1';

export function loadCustomPartnerStalls(): PartnerStallData[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STALLS_STORAGE_KEY);
    if (!raw) return DEFAULT_PARTNER_STALLS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PARTNER_STALLS;
    return parsed;
  } catch {
    return DEFAULT_PARTNER_STALLS;
  }
}

export function saveCustomPartnerStall(stall: PartnerStallData): PartnerStallData[] {
  const existing = loadCustomPartnerStalls().filter(
    (s) => s.slotId !== stall.slotId && s.id !== stall.id
  );
  const updated = [stall, ...existing];
  try {
    localStorage.setItem(CUSTOM_STALLS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage quota errors
  }
  return updated;
}

export function buildAllInteractables(partners: PartnerStallData[]): MelaInteractableSpec[] {
  const partnerSpecs: MelaInteractableSpec[] = partners.map((p) => {
    const slot = STALL_SLOTS.find((s) => s.id === p.slotId) || STALL_SLOTS[0];
    return {
      id: p.id,
      name: p.name,
      hindiSub: p.plan === 'featured' ? '★ FEATURED DIWALI PARTNER' : '✦ DIWALI MELA PARTNER',
      type: 'partner',
      x: slot.x,
      z: slot.z,
      rotY: slot.rotY,
      theme: p.theme,
      greeting: p.greeting,
      description: p.answer,
      partner: p,
    };
  });

  return [...CORE_MELA_ATTRACTIONS, ...partnerSpecs];
}

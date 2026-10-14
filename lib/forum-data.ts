export const communities = [
  { id: 'all', symbol: '◎', en: 'All communities', hy: 'Բոլոր համայնքները' },
  { id: 'general', symbol: '✳', en: 'Campus life', hy: 'Ուսանողական կյանք' },
  { id: 'study', symbol: '▤', en: 'Study together', hy: 'Սովորենք միասին' },
  { id: 'tech', symbol: '⌘', en: 'Tech & coding', hy: 'Տեխնոլոգիա և կոդ' },
  { id: 'creative', symbol: '◈', en: 'Creative corner', hy: 'Ստեղծագործական անկյուն' },
  { id: 'opportunities', symbol: '↗', en: 'Opportunities', hy: 'Հնարավորություններ' },
];
export const seeds = [
  {
    id: 'welcome',
    community: 'general',
    author: 'campus_team',
    title: {
      en: 'Community rules and useful links',
      hy: 'Համայնքի կանոններն ու օգտակար հղումները',
    },
    body: {
      en: 'Ask study questions, share resources, and find classmates. Choose the right community for your post. Do not publish personal information or spam.',
      hy: 'Տուր ուսման հարցեր, կիսվիր նյութերով և գտիր դասընկերներ։ Ընտրիր համապատասխան համայնքը։ Մի հրապարակիր անձնական տվյալներ կամ սպամ։',
    },
    score: 0,
    tag: 'pinned',
    created: 1791889200000,
  },
  {
    id: 'study-group',
    community: 'study',
    author: 'ani_reads',
    title: {
      en: 'Anyone up for a study session before the maths exam?',
      hy: 'Ո՞վ է միանում մաթեմատիկայի քննության նախապատրաստմանը։',
    },
    body: {
      en: 'Thinking of meeting at the library this Thursday at 16:00. We can go over derivatives and practice problems together. Bring your questions (and maybe coffee).',
      hy: 'Մտածում եմ հինգշաբթի՝ ժամը 16:00-ին, հավաքվել գրադարանում։ Միասին կկրկնենք ածանցյալները և կլուծենք խնդիրներ։ Բերեք ձեր հարցերը և, գուցե, սուրճ։',
    },
    score: 0,
    tag: 'question',
    created: 1791887400000,
  },
  {
    id: 'coding',
    community: 'tech',
    author: 'arams_codes',
    title: {
      en: 'I built my first website. Here are 5 things I wish I knew.',
      hy: 'Ստեղծեցի իմ առաջին կայքը։ Ահա 5 բան, որ կուզեի իմանալ։',
    },
    body: {
      en: 'Start small. Make it work on your phone. Learn Git early. Read the error message. And yes, taking a break actually helps you fix that bug.',
      hy: 'Սկսիր փոքրից։ Ստուգիր կայքը հեռախոսով։ Շուտ սովորիր Git։ Կարդա սխալի հաղորդագրությունը։ Եվ այո, ընդմիջումն իսկապես օգնում է գտնել սխալը։',
    },
    score: 0,
    tag: 'discussion',
    created: 1791885600000,
  },
  {
    id: 'photo',
    community: 'creative',
    author: 'lilit.jpg',
    title: {
      en: 'Campus through my lens. An ordinary day, a different perspective.',
      hy: 'Մեր համալսարանը՝ իմ օբյեկտիվով։ Սովորական օր, այլ հայացք։',
    },
    body: {
      en: 'A small reminder to look up from your notes once in a while. What is your favourite spot on campus?',
      hy: 'Մի փոքր հիշեցում՝ երբեմն հայացքը կտրել գրառումներից։ Ո՞րն է քո սիրելի վայրը համալսարանում։',
    },
    score: 0,
    tag: 'discussion',
    created: 1791882000000,
  },
  {
    id: 'club',
    community: 'opportunities',
    author: 'student_union',
    title: {
      en: 'Looking for teammates for a student project',
      hy: 'Թիմակիցներ եմ փնտրում ուսանողական նախագծի համար',
    },
    body: {
      en: 'Building a project, starting a club, or looking for a teammate? Tell us what you are working on and who you need. All experience levels welcome.',
      hy: 'Նախագի՞ծ ես ստեղծում, ակումբ բացո՞ւմ, թե՞ թիմակից փնտրում։ Պատմիր՝ ինչի վրա ես աշխատում և ում ես փնտրում։ Փորձի բոլոր մակարդակները ողջունելի են։',
    },
    score: 0,
    tag: 'discussion',
    created: 1791878400000,
  },
];

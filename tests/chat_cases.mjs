// Shared chat-filter cases: [text, expected refusal code | null]. Run through the SQL (game.chat_check, tests/admin_chat_sql.test.mjs on
// PGlite; tests/admin_chat_contract.mjs over HTTP on the fake and on the local staging stack) and through the JS mirror
// (supabase/functions/room/chat_rules.js, tests/chat_rules.test.mjs). Every row must give the same answer everywhere.
export const CASES = [
  // ok — game talk, quick phrases, numbers that are not phone numbers, Hebrew words that contain a listed word by accident
  ['בהצלחה!', null], ['מהלך יפה 👏', null], ['רגע, אני חושב/ת', null], ['משחק טוב 🤝', null],
  ['קניתי דירה ב-1,500,000 ₪', null], ['יש לי 300 ש"ח פסיבי', null], ['חודש 24 סבב 3', null], ['good luck everyone', null],
  ['כוס מים', null], ['הזין את הנתונים', null], ['אחראי על הכסף', null], ['מזונות', null], ['class pass', null], ['Sussex', null],
  ['שלום לכולם', null], ['GG', null], ['ok.', null], ['נקודה טובה', null], ['😂😂😂', null], ['2+2=4', null], ['i am 13', null],
  ['snapshot', null], ['hello, world', null], ['מה קורה?', null], ['שלוש נקודות... ', null], ['5 6 7', null], ['1500000', null], ['יש לי 1 500 000 בבנק', null], ['1.500.000 ₪', null], ['הגעתי ל 3000000000!', null], ['25000000 שווי', null], ['45', null], ['יש לי 45 חודשים', null], ['חודש 45', null], ['₪45', null], ['4.5', null], ['הכנסה 45,000', null],
  ['נשאר לי 1,455', null], ['as good as gold', null], ['instant', null], ['install the game', null], ['a55hole', 'chat_bad_word'], ['5h1t', 'chat_bad_word'], ['תודה! ממש כיף', null],
  // empty / long
  ['', 'chat_empty'], ['   ', 'chat_empty'], ['​​', 'chat_empty'], ['א'.repeat(121), 'chat_too_long'], ['א'.repeat(120), null],
  // links / domains
  ['www.example.com', 'chat_link'], ['https://x.y', 'chat_link'], ['go to site.com now', 'chat_link'], ['discord.gg/abc', 'chat_link'],
  ['t.me/kid', 'chat_link'], ['wa.me/972', 'chat_link'], ['mysite . co . il', 'chat_link'], ['example(dot)com', 'chat_link'], ['ＷＷＷ．ａｂｃ．ｃｏｍ', 'chat_link'],
  ['bit.ly/x', 'chat_link'], ['example dot com', 'chat_link'],
  // phone numbers
  ['054-1234567', 'chat_phone'], ['0541234567', 'chat_phone'], ['+972 54 123 4567', 'chat_phone'], ['05 4 1 2 3 4 5 6 7', 'chat_phone'],
  ['03-1234567', 'chat_phone'], ['031234567', 'chat_phone'], ['972541234567', 'chat_phone'], ['00972541234567', 'chat_phone'], ['+1 555 123 4567', 'chat_phone'],
  ['(054) 123.45.67', 'chat_phone'], ['תתקשר ל ٠٥٤١٢٣٤٥٦٧', 'chat_phone'], ['תתקשר אליי 0541234567 בערב', 'chat_phone'], ['０５４１２３４５６７', 'chat_phone'],
  // e-mail, handles, social apps
  ['kid@mail.com', 'chat_email'], ['KID.A+B@Mail.Co.IL', 'chat_email'], ['@dani_12', 'chat_handle'], ['תוסיף אותי @ dani', 'chat_handle'],
  ['אינסטה שלי', 'chat_handle'], ['תכתוב לי בוואטסאפ', 'chat_handle'], ['add me on snap', 'chat_handle'], ['my tik tok', 'chat_handle'],
  ['Instagram?', 'chat_handle'], ['דיסקורד', 'chat_handle'], ['WhatsApp me', 'chat_handle'],
  // profanity (English + Hebrew), evasions
  ['fuck', 'chat_bad_word'], ['FUUUCK', 'chat_bad_word'], ['f u c k', 'chat_bad_word'], ['sh1t', 'chat_bad_word'], ['you are an idiot', 'chat_bad_word'],
  ['kill yourself', 'chat_bad_word'], ['shut up', 'chat_bad_word'], ['b!tch', 'chat_bad_word'], ['ｆｕｃｋ', 'chat_bad_word'], ['f​u​c​k', 'chat_bad_word'],
  ['בן זונה', 'chat_bad_word'], ['זיין', 'chat_bad_word'], ['יא מטומטם', 'chat_bad_word'], ['שרמוטה', 'chat_bad_word'], ['כוס אמא שלך', 'chat_bad_word'],
  ['לך תמות', 'chat_bad_word'], ['אתה דביל', 'chat_bad_word'], ['מְטוּמְטָם', 'chat_bad_word'], ['טיפש', 'chat_bad_word'], ['חרא', 'chat_bad_word'],
  ['ז י י ן', 'chat_bad_word'], ['כוסאמק', 'chat_bad_word'],
];

// Friendly random names: "Happy-Otter". The host's name plus a random 6-character code is the room ID: "Happy-Otter-K3X9QA".
// The ID is also the encryption secret, so the code is what keeps rooms unguessable (~40 bits with the name).
const ADJECTIVES = ['Happy', 'Sleepy', 'Jolly', 'Fuzzy', 'Bouncy', 'Sunny', 'Giggly', 'Cosy', 'Zippy', 'Dizzy', 'Snazzy', 'Mellow', 'Peppy', 'Wobbly', 'Breezy', 'Cheeky', 'Dapper', 'Fluffy', 'Groovy', 'Merry', 'Nifty', 'Perky', 'Quirky', 'Snuggly', 'Toasty', 'Wacky', 'Zesty', 'Plucky', 'Silly', 'Lucky', 'Chirpy', 'Glowy', 'Jazzy', 'Spunky', 'Tiny', 'Brave'];
const CHARACTERS = ['Otter', 'Panda', 'Penguin', 'Koala', 'Llama', 'Quokka', 'Capybara', 'Axolotl', 'Hedgehog', 'Narwhal', 'Platypus', 'Sloth', 'Walrus', 'Bunny', 'Duckling', 'Gecko', 'Moose', 'Pika', 'Raccoon', 'Fox', 'Corgi', 'Kitten', 'Puffin', 'Dragon', 'Robot', 'Pixie', 'Wizard', 'Ninja', 'Pirate', 'Astronaut', 'Goblin', 'Yeti', 'Unicorn', 'Dino', 'Owl', 'Frog'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cute = () => `${pick(ADJECTIVES)}-${pick(CHARACTERS)}`;
const CODE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';          // no 0/O/1/I/L: easy to read out loud
const roomIdFor = (name) => `${name}-${Array.from({ length: 6 }, () => CODE[require('crypto').randomInt(CODE.length)]).join('')}`;
// "Happy-Otter-47" -> "HO", used for the little avatar circle
const initials = (name) => String(name).split('-').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
const hueOf = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const normalizeId = (s) => String(s || '').trim().replace(/\s+/g, '-');

module.exports = { cute, roomIdFor, initials, hueOf, normalizeId };

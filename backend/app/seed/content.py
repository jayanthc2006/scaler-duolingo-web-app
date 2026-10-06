"""The Spanish course, as data. 3 units x 3 skills x 2 lessons x 6 exercises (all five types)."""
from app.seed.builders import fill, mc, pairs, tr, typ

COURSE = {"code": "es", "title": "Spanish", "language_name": "Spanish"}

# (unit title, description, color, [(skill title, icon, [(lesson title, [exercises])])])
UNITS = [
    (
        "Unit 1: First Steps",
        "Greet people and talk about everyday things",
        "green",
        [
            ("Greetings", "chat", [
                ("Say hello", [
                    mc('How do you say "Hello"?', ["Hola", "Gracias", "Adiós"], "Hola"),
                    tr("Good morning, friend", ["Buenos", "días", "amigo"], ["noches", "gato"]),
                    pairs([("Hola", "Hello"), ("Adiós", "Goodbye"), ("Gracias", "Thank you"), ("Por favor", "Please")]),
                    fill("¡", " días!", "Buenos", ["Buenos", "Buenas", "Bueno"], "Good morning!"),
                    typ("Goodbye", ["Adiós"]),
                    mc('What does "Gracias" mean?', ["Please", "Thank you", "Sorry"], "Thank you"),
                ]),
                ("Be polite", [
                    mc('How do you say "Please"?', ["Por favor", "De nada", "Lo siento"], "Por favor"),
                    tr("Thank you very much", ["Muchas", "gracias"], ["por", "favor", "hola"]),
                    pairs([("De nada", "You're welcome"), ("Lo siento", "I'm sorry"), ("Perdón", "Excuse me"), ("Buenas noches", "Good night")]),
                    fill("Buenas ", ".", "noches", ["noches", "días", "gracias"], "Good night."),
                    typ("Good night", ["Buenas noches"]),
                    mc('What does "De nada" mean?', ["You're welcome", "Good night", "See you later"], "You're welcome"),
                ]),
            ]),
            ("Introductions", "wave", [
                ("My name", [
                    mc('How do you say "My name is Ana"?', ["Me llamo Ana", "Estoy Ana", "Adiós Ana"], "Me llamo Ana"),
                    tr("I am Ana", ["Yo", "soy", "Ana"], ["eres", "es"]),
                    pairs([("yo", "I"), ("tú", "you"), ("nombre", "name"), ("amigo", "friend")]),
                    fill("Yo ", " Ana.", "soy", ["soy", "eres", "es"], "I am Ana."),
                    typ("What is your name?", ["¿Cómo te llamas?"]),
                    mc('What does "Mucho gusto" mean?', ["Nice to meet you", "Good luck", "Very much"], "Nice to meet you"),
                ]),
                ("Where are you from?", [
                    mc('"Soy de México" means...', ["I am from Mexico", "I like Mexico", "I go to Mexico"], "I am from Mexico"),
                    tr("I am from Spain", ["Soy", "de", "España"], ["eres", "en"]),
                    pairs([("España", "Spain"), ("México", "Mexico"), ("de", "from"), ("país", "country")]),
                    fill("Ella es ", " Colombia.", "de", ["de", "en", "a"], "She is from Colombia."),
                    typ("Nice to meet you", ["Mucho gusto", "Encantado", "Encantada"]),
                    mc('How do you say "And you?"', ["¿Y tú?", "¿Quién?", "¿Dónde?"], "¿Y tú?"),
                ]),
            ]),
            ("Everyday Words", "star", [
                ("Common nouns", [
                    mc('What is "casa"?', ["house", "car", "dog"], "house"),
                    tr("The dog is big", ["El", "perro", "es", "grande"], ["gato", "pequeño"]),
                    pairs([("casa", "house"), ("perro", "dog"), ("gato", "cat"), ("agua", "water")]),
                    fill("El ", " es grande.", "perro", ["perro", "agua", "casa"], "The dog is big."),
                    typ("water", ["agua", "el agua"]),
                    mc('"gato" means...', ["cat", "bird", "horse"], "cat"),
                ]),
                ("Numbers and colors", [
                    mc('How do you say "two"?', ["dos", "tres", "uno"], "dos"),
                    tr("I have three cats", ["Tengo", "tres", "gatos"], ["dos", "perros"]),
                    pairs([("uno", "one"), ("dos", "two"), ("tres", "three"), ("rojo", "red")]),
                    fill("El gato es ", ".", "rojo", ["rojo", "tres", "casa"], "The cat is red."),
                    typ("red", ["rojo"]),
                    mc('What color is "azul"?', ["blue", "green", "yellow"], "blue"),
                ]),
            ]),
        ],
    ),
    (
        "Unit 2: People",
        "Describe your family, friends and yourself",
        "blue",
        [
            ("Family", "home", [
                ("Close family", [
                    mc('Who is "madre"?', ["mother", "father", "sister"], "mother"),
                    tr("My mother is here", ["Mi", "madre", "está", "aquí"], ["padre", "es"]),
                    pairs([("madre", "mother"), ("padre", "father"), ("hermano", "brother"), ("hermana", "sister")]),
                    fill("Mi ", " es alto.", "padre", ["padre", "madre", "casa"], "My father is tall."),
                    typ("brother", ["hermano"]),
                    mc('What does "familia" mean?', ["family", "friend", "name"], "family"),
                ]),
                ("Extended family", [
                    mc('"abuela" means...', ["grandmother", "aunt", "daughter"], "grandmother"),
                    tr("I have a sister", ["Tengo", "una", "hermana"], ["un", "hermano"]),
                    pairs([("abuelo", "grandfather"), ("abuela", "grandmother"), ("hijo", "son"), ("hija", "daughter")]),
                    fill("Ella es mi ", ".", "hija", ["hija", "hijo", "abuelo"], "She is my daughter."),
                    typ("grandfather", ["abuelo"]),
                    mc('How do you say "uncle"?', ["tío", "tía", "primo"], "tío"),
                ]),
            ]),
            ("Descriptions", "palette", [
                ("Feelings", [
                    mc('What does "alto" mean?', ["tall", "short", "old"], "tall"),
                    tr("She is very happy", ["Ella", "es", "muy", "feliz"], ["triste", "él"],
                       alt=[["Ella", "está", "muy", "feliz"]]),
                    pairs([("alto", "tall"), ("bajo", "short"), ("feliz", "happy"), ("triste", "sad")]),
                    fill("El niño está ", ".", "feliz", ["feliz", "casa", "hermano"], "The boy is happy."),
                    typ("tall", ["alto", "alta"]),
                    mc('"triste" means...', ["sad", "happy", "tired"], "sad"),
                ]),
                ("Size and age", [
                    mc('How do you say "big"?', ["grande", "pequeño", "nuevo"], "grande"),
                    tr("The house is new", ["La", "casa", "es", "nueva"], ["nuevo", "el"]),
                    pairs([("grande", "big"), ("pequeño", "small"), ("nuevo", "new"), ("viejo", "old")]),
                    fill("La casa es ", ".", "grande", ["grande", "perro", "tú"], "The house is big."),
                    typ("small", ["pequeño", "pequeña"]),
                    mc('"viejo" means...', ["old", "new", "fast"], "old"),
                ]),
            ]),
            ("Pronouns", "users", [
                ("I, you, he, she", [
                    mc('What does "yo" mean?', ["I", "you", "we"], "I"),
                    tr("You are my friend", ["Tú", "eres", "mi", "amigo"], ["soy", "amiga"]),
                    pairs([("yo", "I"), ("tú", "you"), ("él", "he"), ("ella", "she")]),
                    fill("", " es mi amigo.", "Él", ["Él", "Ella", "Yo"], "He is my friend."),
                    typ("she", ["ella"]),
                    mc('What does "nosotros" mean?', ["we", "they", "you all"], "we"),
                ]),
                ("We and they", [
                    mc('"ellos" means...', ["they", "we", "he"], "they"),
                    tr("We are friends", ["Nosotros", "somos", "amigos"], ["son", "ellos"]),
                    pairs([("nosotros", "we"), ("ellos", "they"), ("usted", "you (formal)"), ("vosotros", "you all")]),
                    fill("Nosotros ", " amigos.", "somos", ["somos", "son", "soy"], "We are friends."),
                    typ("we", ["nosotros", "nosotras"]),
                    mc('How do you say "they"?', ["ellos", "usted", "tú"], "ellos"),
                ]),
            ]),
        ],
    ),
    (
        "Unit 3: Daily Life",
        "Order food, get around town and describe your day",
        "purple",
        [
            ("Food", "food", [
                ("Basic foods", [
                    mc('"manzana" means...', ["apple", "bread", "milk"], "apple"),
                    tr("I eat bread", ["Yo", "como", "pan"], ["bebo", "leche"]),
                    pairs([("pan", "bread"), ("leche", "milk"), ("manzana", "apple"), ("queso", "cheese")]),
                    fill("Yo bebo ", ".", "leche", ["leche", "pan", "queso"], "I drink milk."),
                    typ("cheese", ["queso"]),
                    mc('What does "comer" mean?', ["to eat", "to drink", "to cook"], "to eat"),
                ]),
                ("At the table", [
                    mc('How do you say "water"?', ["agua", "jugo", "café"], "agua"),
                    tr("I want a coffee", ["Quiero", "un", "café"], ["una", "té"]),
                    pairs([("café", "coffee"), ("té", "tea"), ("arroz", "rice"), ("pollo", "chicken")]),
                    fill("Ella come ", " con arroz.", "pollo", ["pollo", "agua", "leche"], "She eats chicken with rice."),
                    typ("rice", ["arroz"]),
                    mc('"beber" means...', ["to drink", "to eat", "to want"], "to drink"),
                ]),
            ]),
            ("Places", "map", [
                ("Around town", [
                    mc('"escuela" means...', ["school", "store", "park"], "school"),
                    tr("I go to school", ["Voy", "a", "la", "escuela"], ["casa", "en"]),
                    pairs([("escuela", "school"), ("tienda", "store"), ("parque", "park"), ("ciudad", "city")]),
                    fill("Voy a la ", ".", "tienda", ["tienda", "comer", "rojo"], "I go to the store."),
                    typ("city", ["ciudad", "la ciudad"]),
                    mc('What does "voy" mean?', ["I go", "I eat", "I am"], "I go"),
                ]),
                ("Where is it?", [
                    mc('How do you say "restaurant"?', ["restaurante", "hospital", "playa"], "restaurante"),
                    tr("Where is the park?", ["¿Dónde", "está", "el", "parque?"], ["la", "casa"]),
                    pairs([("playa", "beach"), ("hospital", "hospital"), ("biblioteca", "library"), ("banco", "bank")]),
                    fill("Estoy en la ", ".", "playa", ["playa", "comer", "azul"], "I am at the beach."),
                    typ("library", ["biblioteca", "la biblioteca"]),
                    mc('"¿Dónde?" means...', ["Where?", "When?", "Who?"], "Where?"),
                ]),
            ]),
            ("Daily Routine", "sun", [
                ("Morning", [
                    mc('What does "por la mañana" mean?', ["in the morning", "at night", "every day"], "in the morning"),
                    tr("I wake up early", ["Me", "despierto", "temprano"], ["tarde", "duermo"]),
                    pairs([("desayuno", "breakfast"), ("almuerzo", "lunch"), ("cena", "dinner"), ("tarde", "afternoon")]),
                    fill("Tomo el ", " a las ocho.", "desayuno", ["desayuno", "cena", "parque"], "I have breakfast at eight."),
                    typ("dinner", ["cena", "la cena"]),
                    mc('"temprano" means...', ["early", "late", "slow"], "early"),
                ]),
                ("Work and rest", [
                    mc('How do you say "I sleep"?', ["Duermo", "Como", "Trabajo"], "Duermo"),
                    tr("I work every day", ["Trabajo", "todos", "los", "días"], ["noche", "ella"]),
                    pairs([("trabajar", "to work"), ("dormir", "to sleep"), ("estudiar", "to study"), ("todos los días", "every day")]),
                    fill("Yo ", " en la oficina.", "trabajo", ["trabajo", "duermo", "bebo"], "I work in the office."),
                    typ("to sleep", ["dormir"]),
                    mc('"estudiar" means...', ["to study", "to play", "to walk"], "to study"),
                ]),
            ]),
        ],
    ),
]

ACHIEVEMENTS = [
    # code, title, description, icon, metric, threshold
    ("first_lesson", "First Steps", "Complete your first lesson", "star", "lessons", 1),
    ("five_lessons", "On a Roll", "Complete 5 lessons", "book", "lessons", 5),
    ("streak_3", "Warming Up", "Reach a 3 day streak", "flame", "current_streak", 3),
    ("streak_7", "Week Warrior", "Reach a 7 day streak", "flame", "current_streak", 7),
    ("xp_100", "Century", "Earn 100 XP", "bolt", "xp_total", 100),
    ("xp_500", "XP Hunter", "Earn 500 XP", "bolt", "xp_total", 500),
    ("skill_1", "Skill Unlocked", "Complete a skill", "trophy", "skills", 1),
    ("skill_5", "Skill Collector", "Complete 5 skills", "trophy", "skills", 5),
    ("legendary_1", "Legend", "Win a Legendary challenge", "crown", "legendaries", 1),
]

# display name, avatar color, XP over the last week (spread over several days)
RIVALS = [
    ("Maya", "purple", 210),
    ("Diego", "orange", 185),
    ("Priya", "pink", 140),
    ("Liam", "green", 130),
    ("Sofía", "red", 95),
    ("Noah", "blue", 70),
    ("Zoe", "yellow", 45),
    ("Kenji", "blue", 20),
]

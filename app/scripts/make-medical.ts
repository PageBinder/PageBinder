/**
 * Populate a notebook with 500 section groups named after people, each with 3 sections
 * named after pets, each with 3 pages: Rabies cert, Medical visit 1, Medical visit 2.
 *
 *   npx tsx scripts/make-medical.ts "/path/to/Medical Records" [groups=500]
 */
import { resolve } from 'node:path'
import { createSection, createGroup } from '../src/main/storage/section'
import { createPage } from '../src/main/storage/page'
import { notebookExists } from '../src/main/storage/notebook'

const FIRST = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle', 'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Dorothy', 'George', 'Melissa', 'Timothy', 'Deborah', 'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon', 'Jeffrey', 'Laura', 'Ryan', 'Cynthia', 'Jacob', 'Kathleen', 'Gary', 'Amy', 'Nicholas', 'Angela', 'Eric', 'Shirley', 'Jonathan', 'Anna', 'Stephen', 'Brenda', 'Larry', 'Pamela', 'Justin', 'Emma', 'Scott', 'Nicole', 'Brandon', 'Helen', 'Benjamin', 'Samantha', 'Samuel', 'Katherine', 'Gregory', 'Christine', 'Alexander', 'Debra', 'Frank', 'Rachel', 'Patrick', 'Carolyn', 'Raymond', 'Janet', 'Jack', 'Catherine', 'Dennis', 'Maria', 'Jerry', 'Heather']
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez']
const PETS = ['Bella', 'Max', 'Luna', 'Charlie', 'Lucy', 'Cooper', 'Daisy', 'Milo', 'Sadie', 'Buddy', 'Molly', 'Rocky', 'Bailey', 'Teddy', 'Maggie', 'Tucker', 'Sophie', 'Bear', 'Chloe', 'Duke', 'Penny', 'Oliver', 'Lola', 'Jack', 'Zoe', 'Leo', 'Stella', 'Toby', 'Lily', 'Bentley', 'Nala', 'Zeus', 'Ruby', 'Winston', 'Coco', 'Finn', 'Rosie', 'Louie', 'Ellie', 'Murphy', 'Pepper', 'Oscar', 'Gracie', 'Gus', 'Roxy', 'Ollie', 'Millie', 'Sam', 'Piper', 'Bruno', 'Mia', 'Hank', 'Willow', 'Jake', 'Abby', 'Scout', 'Ginger', 'Diesel', 'Layla', 'Jax', 'Riley', 'Simba', 'Hazel', 'Loki', 'Nova', 'Thor', 'Cleo', 'Whiskers', 'Mittens', 'Shadow', 'Smokey', 'Tiger', 'Oreo', 'Boots', 'Felix', 'Pumpkin', 'Salem', 'Misty', 'Patches', 'Snowball', 'Peanut', 'Biscuit', 'Waffles', 'Pancake', 'Fluffy', 'Muffin', 'Noodle', 'Ziggy', 'Rex', 'Ace', 'Blue', 'Cash', 'Dexter', 'Frankie', 'Harley', 'Kobe', 'Marley', 'Moose', 'Otis', 'Rusty']
const COLORS = ['#1D9E75', '#D85A30', '#D4537E', '#EF9F27', '#7F77DD', '#378ADD', '#639922', '#888780']

async function main(): Promise<void> {
  const root = resolve(process.argv[2] ?? '')
  const groups = Number(process.argv[3] ?? '500')
  if (!root || !(await notebookExists(root))) throw new Error(`Not a notebook: ${root}`)
  const used = new Set<string>()
  let seed = 7
  const rand = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed % n
  }
  let pages = 0
  const started = Date.now()
  for (let g = 0; g < groups; g++) {
    let person = ''
    do person = `${FIRST[rand(FIRST.length)]} ${LAST[rand(LAST.length)]}`
    while (used.has(person))
    used.add(person)
    const groupRel = await createGroup(root, '', person)
    const petsHere = new Set<string>()
    for (let s = 0; s < 3; s++) {
      let pet = ''
      do pet = PETS[rand(PETS.length)]!
      while (petsHere.has(pet))
      petsHere.add(pet)
      const sectionRel = await createSection(root, groupRel, pet, COLORS[rand(COLORS.length)])
      for (const title of ['Rabies cert', 'Medical visit 1', 'Medical visit 2']) {
        await createPage(root, sectionRel, title)
        pages += 1
      }
    }
    if ((g + 1) % 50 === 0) process.stdout.write(`${g + 1} groups, ${pages} pages, ${((Date.now() - started) / 1000).toFixed(0)} s\n`)
  }
  process.stdout.write(`done: ${groups} groups, ${groups * 3} sections, ${pages} pages in ${((Date.now() - started) / 1000).toFixed(0)} s\n`)
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`)
  process.exit(1)
})

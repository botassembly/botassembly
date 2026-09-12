// The home page walkthrough, step by step.
//
// Hand-written copy beside machine-read files. Every `add` and `show` path is
// relative to `examples/` in this repository and is also the path the page
// displays, so nothing on screen names the folder they sit in. The extractor
// resolves each path against disk and fails the build when one is missing,
// which is the only tie between this copy and those files. No blurb quotes a
// file's words; each one states the idea and links the page that owns it.

/** The assembly the walkthrough walks, and the flow inside it. */
export const ASSEMBLY = 'triage';
export const FLOW = 'triage/triage';

/** The checked event record the last two steps read. */
export const RUN = 'triage-record.jsonl';

/** The commands the page shows. Both run from the folder holding them. */
export const CHECK_COMMAND = 'bot assembly check ./triage/triage';
export const RUN_COMMAND = 'bot run start ./triage/triage @data/request-urgent.txt';

/** Every step's GitHub target hangs off this. A path ending in a slash is a
    folder and takes `/tree/`; anything else is a file and takes `/blob/`, so
    no link on the page redirects. */
export const GITHUB_REPO = 'https://github.com/botassembly/botassembly';

/** The `bot assembly check` paste lives in one place, the assembly's own README. */
export const CHECK_SOURCE = 'triage/README.md';

const CLASSIFY = 'triage/flows/triage/01-classify';
const ROUTE = 'triage/flows/triage/02-route';
const VERIFY = 'triage/flows/triage/03-verify';

export const steps = [
	{
		id: 'the-folder',
		title: 'The folder',
		add: ['triage/ASSEMBLY.md'],
		show: 'triage/ASSEMBLY.md',
		blurb:
			'An assembly is a folder. `ASSEMBLY.md` is the one file it must hold. The front matter sets the options every stage inherits, and the body says what the work is. Nothing registers the folder anywhere else.',
		spec: { href: '/specification/structure/#the-assembly', label: 'The assembly' },
		github: 'triage/ASSEMBLY.md',
	},
	{
		id: 'the-flow',
		title: 'The flow',
		add: ['triage/flows/triage/FLOW.md'],
		show: 'triage/flows/triage/FLOW.md',
		blurb:
			'A flow is a folder of numbered steps. `FLOW.md` carries the one required key, `description`, which is the line a routing decision reads. The listing order is the run order. No graph file records the sequence.',
		spec: { href: '/specification/structure/#the-flow', label: 'The flow' },
		github: 'triage/flows/triage/',
	},
	{
		id: 'a-stage',
		title: 'A stage',
		add: [`${CLASSIFY}/STAGE.md`],
		show: `${CLASSIFY}/STAGE.md`,
		focus: { until: '## Checklist' },
		blurb:
			'A stage is one file. The body is the prompt the agent gets. `$INPUT`, `$OUTPUT`, and `$SKILLS` are slots, and the runtime fills each one with a real path before the agent reads it. The fence at the top is the configuration: this stage gives itself five minutes and takes everything else from the assembly. The keys it may set are fixed, and an unknown one refuses the whole folder.',
		spec: { href: '/specification/slots-and-skills/#the-slots', label: 'The slots' },
		github: `${CLASSIFY}/STAGE.md`,
	},
	{
		id: 'the-checklist',
		title: 'The checklist',
		add: [],
		show: `${CLASSIFY}/STAGE.md`,
		focus: { from: '## Checklist' },
		blurb:
			'The checklist is the first of three checks. The agent affirms one item at a time and gives evidence for each. A stage cannot end while an item stands unaffirmed.',
		spec: { href: '/specification/gating/#the-checklist', label: 'The checklist' },
		github: `${CLASSIFY}/STAGE.md`,
	},
	{
		id: 'the-schema',
		title: 'The schema',
		add: [`${CLASSIFY}/schema.json`],
		show: `${CLASSIFY}/schema.json`,
		blurb:
			'The schema is the second check. The output must be an object carrying `priority`, `trigger`, and `request`, and nothing else. The next stage relies on that shape.',
		spec: { href: '/specification/gating/#the-schema', label: 'The schema' },
		github: `${CLASSIFY}/schema.json`,
	},
	{
		id: 'the-gates',
		title: 'The gates',
		add: [`${VERIFY}/STAGE.md`, `${VERIFY}/gate/01-blocker`, `${VERIFY}/gate/02-sections`],
		show: `${VERIFY}/gate/02-sections`,
		blurb:
			'A gate is the third check. It is a script that runs after the stage and reads what the stage wrote. Exit 0 passes the work on. Any other exit sends the work back to the agent, and the script\'s own words are the reason it gets. The gate beside this one, `01-blocker`, exits 75, which means something outside the run is unavailable, so the run stops as blocked rather than failed.',
		spec: { href: '/specification/gating/#the-gate', label: 'The gate' },
		github: `${VERIFY}/gate/`,
	},
	{
		id: 'the-hooks',
		title: 'The hooks',
		add: [`${CLASSIFY}/before`, `${CLASSIFY}/success`, `${CLASSIFY}/failure`],
		show: `${CLASSIFY}/before`,
		blurb:
			'Hooks run around a stage. They log, notify, or prepare. The record keeps each hook exit code. A hook never rejects the work.',
		spec: { href: '/specification/structure/#hooks', label: 'Hooks' },
		github: `${CLASSIFY}/`,
	},
	{
		id: 'the-skill',
		title: 'The skill',
		add: ['triage/skills/priority-rubric/SKILL.md'],
		show: 'triage/skills/priority-rubric/SKILL.md',
		blurb:
			'A skill is reference material the stage reaches through `$SKILLS`. The two-tier priority rubric is written down once here. Changing the policy is one edit, and no prompt repeats it.',
		spec: { href: '/specification/slots-and-skills/#skills', label: 'Skills' },
		github: 'triage/skills/priority-rubric/',
	},
	{
		id: 'the-choice',
		title: 'The choice',
		add: [`${ROUTE}/CHOOSE.md`, `${ROUTE}/urgent/01-urgent.md`, `${ROUTE}/routine/01-routine.md`],
		show: `${ROUTE}/CHOOSE.md`,
		blurb:
			'A folder can carry the control flow. `CHOOSE.md` in a folder means the agent picks one child folder and the others do not run. Moving a folder changes the branching, and no other file records it.',
		spec: { href: '/specification/graph/#choosemd', label: 'CHOOSE.md' },
		github: `${ROUTE}/`,
	},
	{
		id: 'check-it',
		title: 'Check it',
		add: [],
		kind: 'check',
		layout: 'wide',
		blurb:
			'`bot assembly check` calls no model and costs nothing. It resolves the whole assembly and prints one row for each stage file, with what the stage reads, what it writes, and where every option was set. Five rows here, and two of them are the two arms of the choice, so a run walks four.',
		spec: { href: '/reference/inspection/', label: 'Inspection' },
		github: 'triage/README.md',
	},
	{
		id: 'the-run',
		title: 'The run',
		add: [],
		kind: 'run',
		layout: 'wide',
		blurb:
			'One command runs the flow. Every stage passes through the checks you just read, and the runtime writes each event as it happens.',
		spec: { href: '/specification/running/', label: 'Running' },
		github: `${RUN}/`,
	},
	{
		id: 'the-record',
		title: 'The record',
		add: [],
		kind: 'record',
		layout: 'wide',
		blurb:
			'A run leaves a folder behind. Its `record.jsonl` holds the ordered events, stage outcomes, checks, usage, and final exit. Reading it needs no provider connection. Raw session files stay local because tool output can contain sensitive environment values.',
		spec: { href: '/specification/record/', label: 'The record' },
		github: `${RUN}/`,
	},
];

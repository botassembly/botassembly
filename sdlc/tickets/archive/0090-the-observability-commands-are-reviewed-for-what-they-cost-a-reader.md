---
flow: review
priority: 8
---
# The observability commands are reviewed for what they cost a reader

Running an assembly is half of what this project does. The other half
is letting someone — usually an agent, with no memory and a hard limit
on what it can read — find out what an assembly did. That half has
never been reviewed as a whole.

The commands in question are the reading ones: `runs`, `show`,
`session`, `logs`, `status`, `prune`, `worktree`, and the help each of
them prints. They were built one at a time, and it shows. `bot logs`
bounds its default to the newest 20 runs and announces the omission on
stderr. `bot runs` prints all 480. Both are answering "what happened
recently" for the same reader.

The standard to review against: the characters a caller must read
should be proportional to the information they asked for. The default
for every reading command is the highest-level useful answer, and
everything below it is reachable by adding a filter, a subcommand, or
an argument — never by reading past what you did not want. Output stays
pipeable, so a caller can narrow further with ordinary tools instead of
waiting for a flag to be added.

The questions a reader actually arrives with, which the review should
use as its yardstick — for each one, how many characters does the
current CLI make you read, and how many does the answer need?

- What is running right now?
- What ran recently, and how did it end?
- Which runs refused or failed today, and why?
- What did this one run do, stage by stage?
- Why did this stage go the way it did?
- Did this agent do a good job, and what is the evidence?
- What is this home holding, and what is safe to remove?

The worst failure this review can prevent: an agent burns most of its
context reading a listing in order to learn one fact, and then has no
room left to act on it. That failure is silent — the command succeeded,
the output was correct, and the work still could not get done.

Note for the reviewers: `bot runs` already has its own ticket (0089)
for the bounded default. Do not re-file it. Findings that overlap it
should say so and move on to what it does not cover.

/**
 * Labelled sample decks for checking classification quality
 * (classificationEval.live.test.ts). Written for this test set, not copied
 * from user data.
 *
 * Both decks deliberately share vocabulary with the other subject:
 * programming cards about memory, the heap, garbage collection, threads and
 * pipelines; medical cards about memory, viruses, cells and fibrin threads.
 */

export interface EvalCard {
    front: string;
    back: string;
}

export interface EvalDeck {
    name: string;
    /** Whether these cards are USMLE Step 1 material. */
    examMaterial: boolean;
    cards: EvalCard[];
}

export const CSHARP_DECK: EvalDeck = {
    name: 'C# Fundamentals',
    examMaterial: false,
    cards: [
        { front: 'What is the difference between a value type and a reference type in C#?', back: 'Value types hold their data directly (often on the stack); reference types hold a reference to an object on the managed heap.' },
        { front: 'What does the .NET garbage collector do?', back: 'It automatically frees memory used by objects on the managed heap that are no longer reachable.' },
        { front: 'What is boxing in C#?', back: 'Converting a value type to object or an interface, which copies it into a heap-allocated object.' },
        { front: 'Which interface provides deterministic release of unmanaged resources?', back: 'IDisposable (its Dispose method), usually called through a using statement.' },
        { front: 'What is the difference between a thread and a Task in .NET?', back: 'A thread is an OS-level path of execution; a Task is a higher-level unit of work scheduled on the thread pool.' },
        { front: 'What does the async keyword do on a method?', back: 'It allows await inside the method; the compiler turns it into a state machine that returns a Task.' },
        { front: 'What is a memory leak in a managed language like C#?', back: 'Objects that stay reachable (for example through event handlers or static fields), so the garbage collector can never free them.' },
        { front: 'What are generics used for?', back: 'Type-safe, reusable classes, methods and interfaces parameterized by type, such as List<T>.' },
        { front: 'What does the readonly modifier on a field mean?', back: 'The field can only be assigned in its declaration or in a constructor.' },
        { front: "What does LINQ's Where method return?", back: 'A lazily evaluated IEnumerable<T> containing the elements that match the predicate.' },
        { front: 'What is a delegate in C#?', back: 'A type-safe reference to a method with a particular signature.' },
        { front: 'How does a struct differ from a class?', back: 'A struct is a value type copied on assignment; a class is a reference type.' },
        { front: 'What does the virtual keyword allow?', back: 'A derived class can override the member.' },
        { front: 'What is dependency injection?', back: 'Providing a class with its dependencies from outside, for example through its constructor, instead of creating them inside it.' },
        { front: 'What happens to an exception that is never caught?', back: 'It propagates up the call stack and terminates the process.' },
        { front: 'What causes a StackOverflowException?', back: 'The call stack exceeds its size, usually because of unbounded recursion; it cannot be caught and crashes the process.' },
        { front: 'What is the difference between ref and out parameters?', back: 'A ref argument must be initialized before the call; an out parameter must be assigned inside the method.' },
        { front: 'What are nullable reference types?', back: 'A compiler feature (#nullable enable) that warns when a reference that may be null is used where a non-null value is expected.' },
        { front: 'What is the Common Language Runtime (CLR)?', back: 'The .NET runtime that executes managed code: JIT compilation, memory management, garbage collection and type safety.' },
        { front: 'What is a race condition?', back: 'A bug where the outcome depends on the timing of threads that access shared data without synchronization.' },
        { front: 'What does the lock statement do?', back: 'It lets only one thread at a time run a block of code, using a monitor on an object.' },
        { front: 'What is a switch expression (C# 8)?', back: 'An expression form of switch that maps an input to a value with patterns, e.g. score switch { >= 90 => "A", _ => "F" }.' },
        { front: 'What is the managed heap in .NET?', back: 'The memory area where reference-type objects are allocated and later garbage collected.' },
        { front: 'What is an interface in C#?', back: 'A contract listing members that implementing types must provide.' },
        { front: 'What does sealed do on a class?', back: 'It prevents other classes from inheriting from it.' },
        { front: 'What are the generations of the .NET garbage collector?', back: 'Gen 0, 1 and 2: short-lived objects are collected in gen 0 and survivors are promoted to older generations.' },
        { front: 'What is Span<T>?', back: 'A stack-only type that represents a contiguous region of memory without allocating.' },
        { front: 'In C#, what does == compare for strings?', back: 'The string contents; for most other reference types == compares references by default.' },
        { front: 'What does a using declaration (C# 8) do?', back: 'It disposes the variable automatically at the end of the enclosing scope.' },
        { front: 'What is the middleware pipeline in ASP.NET Core?', back: 'An ordered chain of components; each one handles an HTTP request or passes it to the next.' },
    ],
};

export const STEP1_DECK: EvalDeck = {
    name: 'Step 1 Mixed Review',
    examMaterial: true,
    cards: [
        { front: 'Which enzyme is deficient in classic galactosemia?', back: 'Galactose-1-phosphate uridyltransferase.' },
        { front: 'Which structure is essential for forming new declarative memories?', back: 'The hippocampus (medial temporal lobe).' },
        { front: 'What is the mechanism of action of digoxin?', back: 'It inhibits the Na+/K+-ATPase, raising intracellular Ca2+ and increasing contractility.' },
        { front: 'Which virus causes infectious mononucleosis?', back: 'Epstein-Barr virus (EBV).' },
        { front: 'What is the most common cause of community-acquired pneumonia?', back: 'Streptococcus pneumoniae.' },
        { front: 'Which cells produce pulmonary surfactant?', back: 'Type II pneumocytes.' },
        { front: 'How is the sensitivity of a test calculated?', back: 'True positives / (true positives + false negatives).' },
        { front: 'What is the mechanism of aminoglycosides?', back: 'They bind the 30S ribosomal subunit and inhibit bacterial protein synthesis.' },
        { front: 'Which cells are the main target of HIV?', back: 'CD4+ T cells (also macrophages and dendritic cells).' },
        { front: 'Kussmaul respirations are a sign of what?', back: 'Metabolic acidosis, for example diabetic ketoacidosis.' },
        { front: 'Where is ADH made and where is it released?', back: 'Made in the hypothalamus (supraoptic and paraventricular nuclei); released from the posterior pituitary.' },
        { front: 'What causes hereditary spherocytosis?', back: 'Defects in red cell membrane proteins such as spectrin, ankyrin or band 3.' },
        { front: 'Injury to which nerve causes wrist drop?', back: 'The radial nerve.' },
        { front: 'What is the classic triad of Wernicke encephalopathy?', back: 'Confusion, ophthalmoplegia and ataxia, from thiamine deficiency.' },
        { front: 'Which gene is mutated in Li-Fraumeni syndrome?', back: 'TP53 (p53).' },
        { front: 'What does the positive predictive value of a test depend on?', back: 'Disease prevalence, as well as the test\'s sensitivity and specificity.' },
        { front: 'Which antibodies are characteristic of drug-induced lupus?', back: 'Anti-histone antibodies.' },
        { front: 'What is the rate-limiting enzyme of cholesterol synthesis?', back: 'HMG-CoA reductase.' },
        { front: 'Which heart sound suggests ventricular volume overload in adult heart failure?', back: 'S3.' },
        { front: 'What is the mechanism of action of statins?', back: 'They inhibit HMG-CoA reductase.' },
        { front: 'What is the most common cause of Cushing syndrome?', back: 'Exogenous glucocorticoids.' },
        { front: 'What is the function of the thymus?', back: 'T-cell maturation, including positive and negative selection.' },
        { front: 'What is the first-line treatment for absence seizures?', back: 'Ethosuximide.' },
        { front: 'What is a case-control study?', back: 'It compares people with a disease to people without it, looking back at prior exposures; it reports an odds ratio.' },
        { front: 'Which defense mechanism attributes one\'s own unacceptable feelings to others?', back: 'Projection.' },
        { front: 'Which motor protein carries cargo retrogradely along microtubules?', back: 'Dynein.' },
        { front: 'What forms the lipid bilayer of the cell membrane?', back: 'Phospholipids, with cholesterol and membrane proteins.' },
        { front: 'Which type of hypersensitivity is allergic contact dermatitis?', back: 'Type IV (delayed, T cell-mediated).' },
        { front: 'In which phase does nondisjunction most often occur in Down syndrome?', back: 'Maternal meiosis I.' },
        { front: 'What are the fibrin threads of a clot formed from?', back: 'Fibrinogen, cleaved by thrombin.' },
    ],
};

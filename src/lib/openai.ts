import OpenAI from "openai";
import { openaiStore } from "../stores/openai";
import { get } from 'svelte/store'


// return true if the api key is valid
export async function isValidApiKey(apikey: string) : Promise<boolean> {
    if (!apikey) {
        return false;
    }

    const openai = new OpenAI(
        {
            apiKey: apikey,
            dangerouslyAllowBrowser: true
        }
    );

    try {
        // wait for the response
        await openai.models.list();

        openaiStore.update(value => {
            value.apiKey = apikey;
            return value;
        });

        return true;
    } catch (error) {
        throw new Error("Invalid API Key");
    }
}

const params = {
    name: 'ihaveaplan',
    model: 'gpt-3.5-turbo-0125',
    description: 'Create a learning plan from your documents.',
    instructions: 'You are helpfull assistant that can generate learning plan based on user goals and options.',
    temperature: 0.2,
}


// create an assistant
export async function createAssistant() {
    const openai = new OpenAI(
        {
            apiKey: get(openaiStore).apiKey,
            dangerouslyAllowBrowser: true
        }
    );

    if (!get(openaiStore).fileId) {
        throw new Error("No file uploaded");
    }

    try {
        const response = await openai.beta.assistants.create({
            model: params.model,
            description: params.description,
            instructions: params.instructions,
            name: params.name,
            temperature: params.temperature,
            tools: [{type: 'file_search'}],
            tool_resources: {
                file_search: {
                    vector_store_ids: [get(openaiStore).vectorStoreId],
                }
            },
        })
        if (response.id) {
            openaiStore.update(value => {
                value.assistantId = response.id;
                return value;
            });
        }
    } catch (error) {
        throw new Error(`Error creating assistant: ${error}`);
    }
}

// upload a file to the assistant
export async function uploadFile(file: File) {
    const openai = new OpenAI(
        {
            apiKey: get(openaiStore).apiKey,
            dangerouslyAllowBrowser: true
        }
    );

    try {
        // Upload the file to OpenAI
        const response = await openai.files.create({
            file: file,
            purpose: 'assistants',
        });

        // set to store fileId
        openaiStore.update(value => {
            value.fileId = response.id;
            return value;
        });

        // Create a vector store including our two files.
        let vectorStore = await openai.beta.vectorStores.create({
            name: "ihaveaplan",
            file_ids: [response.id],    
            expires_after: {
                anchor: 'last_active_at',
                days: 1,
            }
        });

        // set to store vectorStoreId
        openaiStore.update(value => {
            value.vectorStoreId = vectorStore.id;
            return value;
        });
    } catch (error) {
        throw new Error(`Error uploading file: ${error}`);
    }
}

export async function clearOpenAI() {
    const openai = new OpenAI(
        {
            apiKey: get(openaiStore).apiKey,
            dangerouslyAllowBrowser: true
        }
    );

    try {
        if (get(openaiStore).threadId) await openai.beta.threads.del(get(openaiStore).threadId);
        if (get(openaiStore).assistantId) await openai.beta.assistants.del(get(openaiStore).assistantId);
        if (get(openaiStore).vectorStoreId) await openai.beta.vectorStores.del(get(openaiStore).vectorStoreId);
        if (get(openaiStore).fileId) await openai.files.del(get(openaiStore).fileId);
        if (get(openaiStore).fileId) await openai.beta.threads.del(get(openaiStore).threadId);

        openaiStore.update(value => {
            value.assistantId = '';
            value.fileId = '';
            value.vectorStoreId = '';
            value.threadId = '';
            return value;
        });
    } catch (error) {
        throw new Error(`Error clearing: ${error}`);
    }
}


export async function clearEverything() {
    const openai = new OpenAI(
        {
            apiKey: get(openaiStore).apiKey,
            dangerouslyAllowBrowser: true
        }
    );

    try{
        const assistants = await openai.beta.assistants.list();
        for (const assistant of assistants.data) {
            await openai.beta.assistants.del(assistant.id);
        }

        const files = await openai.files.list();
        for (const file of files.data) {
            await openai.files.del(file.id);
        }
        
        // todo delete threads
        const threadID = get(openaiStore).threadId;
        if (threadID) {
            await openai.beta.threads.del(threadID);
            openaiStore.update(value => {
                value.threadId = '';
                return value;
            });
        }

        let done = false;

        let vectorStores = await openai.beta.vectorStores.list();
        console.log(vectorStores.data);


        while (vectorStores.data.length > 0 && !done) {
            console.log(`length: ${vectorStores.data.length}`)

            const last = vectorStores.data[vectorStores.data.length - 1];

            // except latest index
            for (let i = 0; i < vectorStores.data.length - 1; i++) {
                console.log(`deleting ${vectorStores.data[i].id}`);
                await openai.beta.vectorStores.del(vectorStores.data[i].id);
            }

            if (vectorStores.hasNextPage()) {
                console.log('getting next page');
                vectorStores = await vectorStores.getNextPage();

                // delete the last one
                console.log(`deleting ${last.id}`);
                await openai.beta.vectorStores.del(last.id);
            } else {
                done = true;
            }
        }
    } catch (error) {
        throw new Error(`Error clearing everything: ${error}`);
    }
}

const promptChaptersPlan = `Generate a lists all chapters of the book, including only the number and name of each chapter. The format should precisely follow these specifications:
1. [Name]
2. [Name]
// Continue with additional chapters as necessary

Ensure that every chapter of the book is represented, with the exact name as it appears in the book.
`;

export async function extractChapters(): Promise<Chapter[]> {
    const openai = new OpenAI(
        {
            apiKey: get(openaiStore).apiKey,
            dangerouslyAllowBrowser: true
        }
    );

    let threadId = get(openaiStore).threadId;

    try {
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        
        const message = await openai.beta.threads.messages.create(
        thread.id,
        {
            role: "user",
            content: promptChaptersPlan,
        });

        let run = await openai.beta.threads.runs.create(
            thread.id,
            { 
                assistant_id: get(openaiStore).assistantId,
                instructions: "Generate a list of chapters from the book.",
            },                
        );

        while (['queued', 'in_progress', 'cancelling'].includes(run.status)) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            run = await openai.beta.threads.runs.retrieve(
                run.thread_id,
                run.id
            );
        }

        const messages = await openai.beta.threads.messages.list(
            run.thread_id,
            {
                limit: 1,
                order: "desc",
            },
        );

        if (messages.data.length === 0) {
            throw new Error("Error extracting chapters: No data returned");
        }

        const chapter = messages.data[0];
        let chaptersRaw = '';

        chapter.content.forEach((content) => {
            if (content.type === 'text') chaptersRaw += content.text.value + '\n';
        });

        return extractchaptersRaw(chaptersRaw);;
    } catch (error) {
        throw new Error(`Error creating assistant: ${error}`);
    } finally {
        if (threadId) await openai.beta.threads.del(threadId);
    }
}

function extractchaptersRaw(chaptersRaw: string) : Chapter[] {
    // clear chapters
    let chapters: Chapter[] = [];

    // find find where number 1 is
    const start = chaptersRaw.indexOf('1.');

    // get the chapters
    const chaptersRawExtracted = chaptersRaw.substring(start, chaptersRaw.length);

    // split the chapters
    const chaptersArray = chaptersRawExtracted.split('\n');

    // remove empty strings
    const chaptersArrayFiltered = chaptersArray.filter((chapter) => chapter !== '');

    // create chapter objects
    for (let i = 0; i < chaptersArrayFiltered.length; i++) {
        const chapter = chaptersArrayFiltered[i];
        chapters.push(
            {
                id: i + 1,
                name: chapter,
                topics: [],
                done: false,
            },
        );
    }

    return chapters;
}
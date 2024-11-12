const OpenAI = require('openai');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  });

const app = express();
app.use(morgan('combined'));
//app.use(limiter);
var jsonParser = bodyParser.json();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

app.post('/verhelder', jsonParser, async (req, res) => {
    try {
        if (!req.body.LetterContent || !req.body.LetterKinds || !req.body.SpecificKinds) {
            return res.status(400).send("Invalid request: Missing required fields.");
        }

        const letterKinds = JSON.parse(req.body["LetterKinds"]);
        const specificKinds = JSON.parse(req.body["SpecificKinds"]);

        const completion = await openai.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `Gezien de volgende tekst, identificeer welk type brief dit is. Kies uit een van de volgende opties: ${JSON.stringify(letterKinds)}. Geef je antwoord in JSON-indeling als volgt: {"LetterKind": "JeAntwoordHier"}`
                },
                { role: "user", content: req.body["LetterContent"] }
            ],
            model: model,
        });

        const letterKindResponse = completion.choices[0].message.content;
        const letterKindResponseClean = letterKindResponse.trim().replace(/```json|```/g, '');
        const letterKind = JSON.parse(letterKindResponseClean);

        let rawResponse = "";
        switch(letterKind["LetterKind"]) {
            case "Brief":
                rawResponse = await doLetterPrompt(req.body["LetterContent"], specificKinds["Brief"]);
                break;
            case "Factuur":
                rawResponse = await doInvoicePrompt(req.body["LetterContent"], specificKinds["Factuur"]);
                break;
            case "Belasting":
                rawResponse = await doTaxPrompt(req.body["LetterContent"], specificKinds["Belasting"]);
                break;
            case "Toeslag":
                rawResponse = await doAllowancePrompt(req.body["LetterContent"], specificKinds["Toeslag"]);
                break;
            default:
                throw new Error(`Unknown LetterKind: ${letterKind["LetterKind"]}`);
        }

        const cleanResponse = rawResponse.trim().replace(/```json|```/g, '');
        res.send(cleanResponse);

    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).send("An error occurred while processing the request.");
    }
});

async function doLetterPrompt(content, letterKinds) {
    const helder = await openai.chat.completions.create({
        messages: [{ 
            role: "system", 
            content: 
                `
                Vereenvoudig de volgende brief naar B2-leesniveau in de taal waarin deze is geschreven (Nederlands). Haal de volgende informatie uit de brief:
                1. Vereenvoudigde inhoud van de brief naar B2 leesniveau, gebruik hiervoor 35 woorden of minder.
                2. De schrijver of afzender van de brief.
                3. Het algemene onderwerp van de brief in eenvoudige bewoordingen.
                4. Het \`LetterKind\` (kies uit de volgende: ${JSON.stringify(letterKinds)}).

                Geef de informatie terug in de volgende JSON-indeling:

                {
                "TextInfo": {
                    "SimplifiedContent": "Vereenvoudigde versie van de brief",
                    "Sender": "De afzender van de brief",
                    "Subject": "Het algemene onderwerp van de brief"
                },
                "LetterKind": "Brief",
                "SpecificKind": "LetterKind enum waarde",
                }
                `,
        },
        {
            role: "user",
            content: content
        }],
        model: model,
    });

    return helder.choices[0].message.content;
}

async function doInvoicePrompt(content, invoiceKinds) {
    const helder = await openai.chat.completions.create({
        messages: [{ 
            role: "system", 
            content: 
                `
                Vereenvoudig de volgende factuur naar B2-leesniveau in het Nederlands, zodat de lezer begrijpt waar deze factuur voor is. Haal de volgende informatie uit de factuur:
                1. Vereenvoudigde inhoud van de factuur naar B2 leesniveau, gebruik hiervoor 35.
                2. De afzender van de factuur (als het een bedrijf is, vermeld de bedrijfsnaam, anders de persoon of partij die de factuur heeft verzonden).
                3. Het bedrag van de factuur zonder extra tekens. bijvoorbeeld: 45.50.
                4. De vervaldatum van de betaling.
                5. Het \`InvoiceKind\` (kies uit de volgende: ${JSON.stringify(invoiceKinds)}]).

                Geef de informatie terug in de volgende JSON-indeling:

                {
                "TextInfo": {
                    "SimplifiedContent": "Vereenvoudigde versie van de factuur",
                    "Sender": "De afzender van de factuur dus aan wie het bedrag wordt betaald",
                    "Subject": "Algemeen onderwerp van de factuur (optioneel)"
                },
                "LetterKind": "Factuur",
                "SpecificKind": "InvoiceKind enum waarde",
                "Amount": "Het te betalen bedrag in het volgende format: \`100.40\`",
                "PaymentDeadline": "De vervaldatum in ISO8601-formaat",
                }
                `,
        },
        {
            role: "user",
            content: content
        }],
        model: model,
    });

    return helder.choices[0].message.content;
}

async function doTaxPrompt(content, taxKinds) {
    const helder = await openai.chat.completions.create({
        messages: [{ 
            role: "system", 
            content: 
                `
                Vereenvoudig de volgende belastingbrief naar B2-leesniveau in het Nederlands, zodat de lezer begrijpt waar deze belastingbrief over gaat. Haal de volgende informatie uit de belastingbrief:
                1. Vereenvoudigde inhoud van de belastingbrief naar B2-leesniveau, houd het bij maximaal 36 woorden met alleen de belangrijkste informatie.
                2. Controleer of de brief een boete betreft, vermeld dit expliciet.
                3. Het bedrag van de belasting zonder extra tekens. bijvoorbeeld: 45.50.
                4. De vervaldatum van de betaling.
                5. Het \`TaxKind\` (kies uit de volgende: ${JSON.stringify(taxKinds)}).

                Geef de informatie terug in de volgende JSON-indeling:

                {
                "TextInfo": {
                    "SimplifiedContent": "Vereenvoudigde versie van de belastingbrief",
                    "Sender": "De afzender van de belastingbrief (indien beschikbaar)",
                    "Subject": "Algemeen onderwerp van de belastingbrief (optioneel)"
                },
                "LetterKind": "Belasting",
                "SpecificKind": "TaxKind enum waarde",
                "Amount": "Het te betalen bedrag",
                "PaymentDeadline": "De vervaldatum in ISO8601-formaat",
                }
                `,
        },
        {
            role: "user",
            content: content
        }],
        model: model,
    });

    return helder.choices[0].message.content;
}

async function doAllowancePrompt(content, allowanceKinds) {
    const helder = await openai.chat.completions.create({
        messages: [{ 
            role: "system", 
            content: 
                `
                Vereenvoudig de volgende toelagebrief naar B2-leesniveau in het Nederlands, zodat de lezer begrijpt waar deze toelage voor is. Haal de volgende informatie uit de toelagebrief:
                1. Vereenvoudigde inhoud van de toelagebrief naar B2 leesniveau, gebruik hiervoor 35 woorden.
                2. Het bedrag dat door de toelage wordt verstrekt.
                3. De begindatum en einddatum van de toelage.
                4. Het \`AllowanceKind\` (kies uit de volgende: ${JSON.stringify(allowanceKinds)}).

                Geef de informatie terug in de volgende JSON-indeling:

                {
                "TextInfo": {
                    "SimplifiedContent": "Vereenvoudigde versie van de toelagebrief",
                    "Sender": "De afzender van de toeslagbrief (indien beschikbaar)",
                    "Subject": "Algemeen onderwerp van de toelagebrief (optioneel)",
                },
                "LetterKind": "Toeslag",
                "SpecificKind": "AllowanceKind enum waarde",
                "Amount": "Het bedrag van de toeslag zonder extra tekens. bijvoorbeeld": 45.50",
                "PaymentDeadline": "",
                "StartDate": "De begindatum van de toelage in ISO8601-formaat",
                "EndDate": "De einddatum van de toelage in ISO8601-formaat"
                }
                `,
        },
        {
            role: "user",
            content: content
        }],
        model: model,
    });

    return helder.choices[0].message.content;
}

const port = 8090;
app.listen(port, () => {
    console.log(`Test proxy listening on port ${port}`)
});
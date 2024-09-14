const OpenAI = require('openai');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
var jsonParser = bodyParser.json();
//{ apiKey: "sk-proj-UDCluYGiW0KYnF2n4KMAT3BlbkFJanN9JqyswsZScOqRY5ZH" }
const openai = new OpenAI()
//Test endpoint
app.get('/ping', (req, res) => {
    console.log(req);
    res.send("Hello World!!!");
});

app.post('/verhelder', jsonParser, async (req, res) => {
    console.log(req.body["letterContent"]);

    const completion = await openai.chat.completions.create({
        messages: [{ 
            role: "system", 
            content: 
                `Hier is de text van een brief, de text van deze brief is verkregen door het gebruik van OCR.
                Er kunnen dus een aantal typ fouten in staan. Denk hierbij aan 0 in plaats van O. Houdt hier rekening mee.
                kun je me vertellen wat voor soort brief dit is? 
                Kies uit de volgende categorieën: regular (Normale Brief), appointment (afspraak), invoice (Factuur), tax (Beslastingdiesnt). 
                Gebruik de tekst tussen de '()' als referentie, maar het woord ervoor als waarde om mee te geven. Dus bij een Normale Brief gebruik de waarde 'regular'
                Als een brief geen informatie bevat over afspraken of geld bedraagd dit een normale brief (regular).
                Als er in de brief word gesproken over het maken van een afspraak gaat die uiteraard over een afspraak (appointment).
                Als de brief een rekening of factuur is gaat dit natuurlijk over een factuur (invoice).
                Als de brief van de belasting diensts komt is dit natuurlijk een belasting brief (tax).
                Geef mij het antwoord in het volgende format: 
                { \"soort\": \"categorie\",\"richting\": \"ontvangen, betalen of niets\"}. 
                Kun je me ook vertellen of de ontvanger van deze brief moet betalen of dat deze geld ontvangt?
                Als de inhoud van de brief geen relevante text bij zich draagt ben je verboden zelf informatie te verzinnen.
                Dus als er geen informatie in staat dat duidt op een betaling gaat het om een normale brief.

                Inhoud van de brief: ${req.body["letterContent"]}` 
        }],
        model: "gpt-4o-mini",
    });

    var gpt_response = completion.choices[0].message.content;;
    gpt_response = JSON.parse(gpt_response);

    const helder = await openai.chat.completions.create({
        messages: [{ 
            role: "system", 
            content: 
                `Hier is de text van een ${gpt_response.soort} brief. 
                De ontvanger van deze brief zal geld ${gpt_response.richting}.
                kun je deze brief versimpelen naar maximaal 5 kernpunten die begrijpbaar zijn op B2 taal niveau.
                Als er minder kernpunten nodig zijn om de brief samen te vatten heeft dit de voorkeur. 
                Dus als de brief bijvoorbeeld maar 1 of 2 zinnen bevat hoeven hier geen 5 kern punten bij verzonnen worden.
                En wat je ook doet, je mag geen informatie verzinnen die niet in de brief staat.
                Negeer informatie betreffende adres en naam van de ontvanger, deze informatie is niet relevant.
                Geef het antwoord terug in het volgende format: 
                {
                    letter: {
                        "sender": "Hier de partij welke de brief heeft verzonden",
                        "simplifiedContent": "Hier de rede van de brief, waarom is de brief verzonden. Zet hier de versimpelde brief neer",
                        "kind": "${gpt_response.soort}" Pas deze nooit aan, dit is al bepaald.
                    },
                    "amount": 0.0,
                    "isPaymentDue": true,
                    "paymentReference": "IN001",
                    "paymentDeadline": "2024-08-30",
                }
                Het format hierboven dient kloppende json te worden.

                De brief: ${req.body["letterContent"]}` 
        }],
        model: "gpt-4o-mini",
    });

    console.log(helder.choices[0].message.content)

    res.send(helder.choices[0].message.content);
});

const port = 8090;
app.listen(port, () => {
    console.log(`Test proxy listening on port ${port}`)
});
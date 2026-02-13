require('dotenv').config();

const axios = require('axios');

const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const API_BASE_URL = 'https://api.hubapi.com/crm/v3/objects/contacts';
const HUBSPOT_HEADERS = {
  Authorization: `Bearer ${HUBSPOT_TOKEN}`,
};

// Capitaliza palavras compostas por espaço, hífen e apóstrofo
const normalizeName = (value) => {
  if (value == null) return '';

  const trimmed = String(value).trim();
  if (!trimmed) return '';

  return trimmed
    .toLowerCase()
    .replace(/(?:^|[\s\-'])\p{L}/gu, (match) => match.toUpperCase());
};

const buildContactUpdate = (contact) => {
  const firstName = contact?.properties?.firstname || '';
  const lastName = contact?.properties?.lastname || '';

  const normalizedFirstName = normalizeName(firstName);
  const normalizedLastName = normalizeName(lastName);

  const newProperties = {};

  if (firstName !== normalizedFirstName) {
    newProperties.firstname = normalizedFirstName;
  }

  if (lastName !== normalizedLastName) {
    newProperties.lastname = normalizedLastName;
  }

  return Object.keys(newProperties).length > 0
    ? { id: contact.id, newProperties }
    : null;
};

const fetchContactsPage = async (after = null) => {
  const response = await axios.get(API_BASE_URL, {
    params: {
      limit: 100,
      after,
      properties: 'firstname,lastname',
    },
    headers: HUBSPOT_HEADERS,
  });

  return response.data;
};

const updateContactsInBatches = async (contacts) => {
  const batchSize = 10;

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);

    const batchBody = {
      inputs: batch.map((contact) => ({
        id: contact.id,
        properties: contact.newProperties,
      })),
    };

    const batchNumber = i / batchSize + 1;
    console.log(`Atualizando lote ${batchNumber} (${batch.length} contatos)...`);

    try {
      await axios.post(`${API_BASE_URL}/batch/update`, batchBody, {
        headers: {
          ...HUBSPOT_HEADERS,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error(
        `Erro ao atualizar lote ${batchNumber}:`,
        error.response?.data || error.message,
      );
    }
  }
};

const processContacts = async () => {
  if (!HUBSPOT_TOKEN) {
    console.error('Erro: A variável de ambiente HUBSPOT_TOKEN não foi encontrada.');
    process.exitCode = 1;
    return;
  }

  const contactsToUpdate = [];
  let after = null;
  let page = 1;

  try {
    console.log('Buscando contatos no HubSpot...');

    do {
      const data = await fetchContactsPage(after);
      const results = Array.isArray(data?.results) ? data.results : [];

      for (const contact of results) {
        const update = buildContactUpdate(contact);
        if (update) contactsToUpdate.push(update);
      }

      console.log(`Página ${page} processada. Contatos para atualizar até agora: ${contactsToUpdate.length}.`);

      after = data?.paging?.next?.after || null;
      page += 1;
    } while (after);

    if (contactsToUpdate.length === 0) {
      console.log('Nenhum contato precisa de atualização.');
      return;
    }

    console.log(`Total de contatos para atualizar: ${contactsToUpdate.length}.`);
    await updateContactsInBatches(contactsToUpdate);

    console.log('Processo concluído com sucesso!');
  } catch (error) {
    console.error('Erro ao processar contatos:', error.response?.data || error.message);
    process.exitCode = 1;
  }
};

if (require.main === module) {
  processContacts();
}

module.exports = {
  normalizeName,
  buildContactUpdate,
};

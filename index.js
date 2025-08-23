// A primeira linha do seu arquivo, antes de qualquer outro código
require('dotenv').config();

const axios = require('axios');
// ... o resto do seu código

// Configure seu token de acesso como uma variável de ambiente por segurança
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

// Verifique se o token está definido
if (!HUBSPOT_TOKEN) {
  console.error("Erro: O token de acesso do HubSpot não foi encontrado. Certifique-se de que a variável de ambiente HUBSPOT_TOKEN está definida.");
  process.exit(1);
}

const API_BASE_URL = 'https://api.hubapi.com/crm/v3/objects/contacts';

// Função auxiliar para capitalizar a primeira letra
const capitalize = (text) => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

// Função principal para buscar, corrigir e atualizar os contatos
const processContacts = async () => {
  let contactsToUpdate = [];
  let after = null; // Para paginação

  try {
    console.log("Buscando contatos...");

    do {
      const response = await axios.get(API_BASE_URL, {
        params: {
          limit: 100, // Número de contatos por requisição
          after: after, // Para buscar a próxima página
          properties: 'firstname,lastname' // Propriedades que queremos buscar
        },
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`
        }
      });

      const { results, paging } = response.data;
      
      for (const contact of results) {
        const { id, properties } = contact;
        let needsUpdate = false;
        const newProperties = {};

        // Verifique e corrija 'firstname'
        const correctedFirstName = capitalize(properties.firstname);
        if (properties.firstname !== correctedFirstName) {
          newProperties.firstname = correctedFirstName;
          needsUpdate = true;
        }

        // Verifique e corrija 'lastname'
        const correctedLastName = capitalize(properties.lastname);
        if (properties.lastname !== correctedLastName) {
          newProperties.lastname = correctedLastName;
          needsUpdate = true;
        }

        if (needsUpdate) {
          contactsToUpdate.push({ id, newProperties });
        }
      }

      // Se houver mais páginas, defina o cursor 'after'
      after = paging?.next?.after || null;

    } while (after);

    console.log(`Encontrados ${contactsToUpdate.length} contatos para atualizar.`);

    // Envie as atualizações em lotes
    if (contactsToUpdate.length > 0) {
      await updateContactsInBatches(contactsToUpdate);
    }
    
    console.log("Processo concluído!");

  } catch (error) {
    console.error("Ocorreu um erro:", error.response?.data || error.message);
  }
};

// Função para atualizar os contatos em lotes de 10 (limite da API de lote)
const updateContactsInBatches = async (contacts) => {
  const batchSize = 10;
  
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    
    const batchBody = {
      inputs: batch.map(contact => ({
        id: contact.id,
        properties: contact.newProperties
      }))
    };
    
    console.log(`Atualizando lote ${i / batchSize + 1}...`);
    
    try {
      await axios.post(`${API_BASE_URL}/batch/update`, batchBody, {
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error(`Erro ao atualizar lote ${i / batchSize + 1}:`, error.response?.data || error.message);
    }
  }
};

// Inicie o processo
processContacts();
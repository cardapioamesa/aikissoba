// Configuração do cardápio.
//
// O bloco `firebase` vem do console (Configurações do projeto > Seus apps > app
// web). Ele NÃO é segredo: identifica o projeto, e qualquer site que use o
// Firebase o expõe assim. Quem protege os dados são as regras do Firestore
// (firestore.rules), conferidas no servidor.
window.CARDAPIO_CONFIG = {
  restaurante: "aikissoba",
  firebase: {
    apiKey: "COLE_AQUI",
    authDomain: "COLE_AQUI",
    projectId: "COLE_AQUI",
    storageBucket: "COLE_AQUI",
    messagingSenderId: "COLE_AQUI",
    appId: "COLE_AQUI"
  }
};

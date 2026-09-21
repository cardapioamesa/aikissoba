# Gera semente.js: o cardápio inicial da Aikissoba (textos, seções, pratos e
# fotos) que a página semear.html grava no Firestore uma única vez.
#
# Tudo aqui já é público — é o próprio cardápio. Nenhum e-mail ou senha entra
# neste arquivo: os e-mails dos donos são digitados na hora, em semear.html.
import base64, io, json, os
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(BASE, "img")
URL_PUBLICA = "https://cardapioamesa.github.io/aikissoba/"


def foto_prato(nome, lado=340, q=76):
    im = Image.open(os.path.join(IMG, nome)).convert("RGB")
    if im.size != (lado, lado):
        im = im.resize((lado, lado), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def foto_garrafa(nome, altura=160):
    """bebidas: recorte com fundo transparente, em WebP"""
    im = Image.open(os.path.join(IMG, nome)).convert("RGBA")
    im = im.resize((max(1, round(im.width * altura / im.height)), altura), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=82, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def foto(nome):
    return foto_garrafa(nome) if nome.endswith(".png") else foto_prato(nome)


def logo(lado=220):
    im = Image.open(os.path.join(IMG, "logo.png")).convert("RGB").resize((lado, lado), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


SECOES = [
    ("yakisoba",  "Yakisoba",  "焼きそば",    "fotos",
     "Macarrão salteado com legumes e verduras frescas. Molho especial, receita da família aikissoba."),
    ("lamen",     "Lámen",     "ラーメン",    "fotos",
     "Tigela fumegante, caldo à base de frango. Para tomar devagar."),
    ("porcoes",   "Porções",   "一品料理",    "fotos",
     "Para dividir na mesa — ou começar por elas."),
    ("especiais", "Especiais", "特別メニュー", "destaque",
     "Topokki: massa de arroz glutinoso no molho 3 queijos. A pedida coreana da casa."),
    ("bebidas",   "Bebidas",   "お飲み物",    "lista",
     "Geladas, para equilibrar o caldo."),
]

ITENS = [
    ("yaki-carne",   "yakisoba", "Yakisoba de Carne",   "Carne, legumes e verduras, macarrão e molho de yakisoba especial.",   "30", "", "yaki-carne.jpg"),
    ("yaki-frango",  "yakisoba", "Yakisoba de Frango",  "Frango, legumes e verduras, macarrão e molho de yakisoba especial.",  "28", "", "yaki-frango.jpg"),
    ("yaki-pernil",  "yakisoba", "Yakisoba de Pernil",  "Pernil, legumes e verduras, macarrão e molho de yakisoba especial.",  "28", "", "yaki-pernil.jpg"),
    ("yaki-camarao", "yakisoba", "Yakisoba de Camarão", "Camarão, legumes e verduras, macarrão e molho de yakisoba especial.", "38", "", "yaki-camarao.jpg"),
    ("yaki-legumes", "yakisoba", "Yakisoba de Legumes", "Legumes e verduras, macarrão e molho de yakisoba especial.",          "28", "", "yaki-legumes.jpg"),

    ("lamen-shoyu",  "lamen", "Shoyu Lámen",   "Caldo à base de frango, temperado com preparado de shoyu.",                   "40", "", "lamen-shoyu.jpg"),
    ("lamen-misso",  "lamen", "Missô Lámen",   "Caldo à base de frango, temperado com pasta de missô preparado.",             "40", "", "lamen-misso.jpg"),
    ("lamen-kimchi", "lamen", "Kinmchi Lámen", "Caldo à base de frango com pasta de missô preparado e acrescido de kinmuchi.", "50", "", "lamen-kimchi.jpg"),

    ("porc-guiouza",  "porcoes", "Guiouza",    "Pastelzinho japonês, cozido no vapor, com uma crosta crocante.",        "25", "5 unidades · porco com nirá ou legumes", "porc-guiouza.jpg"),
    ("porc-karaague", "porcoes", "Karaague",   "Frango frito japonês, temperado com uma marinada especial.",            "30", "5 unidades", "porc-karaague.jpg"),
    ("porc-tempura",  "porcoes", "Tempurá",    "Massa leve com verduras e legumes, fritos. Acompanha molho ponzu.",     "25", "5 unidades", "porc-tempura.jpg"),
    ("porc-kimchi",   "porcoes", "Kinmchi",    "Conserva coreana apimentada, composta de acelga, cenoura e cebolinha.", "15", "", "porc-kimchi.jpg"),
    ("porc-misso",    "porcoes", "Missôshiro", "Sopa à base de missô, acrescida de algas wakame e cebolinha.",          "15", "", "porc-misso.jpg"),

    ("esp-topokki", "especiais", "Topokki 3 Queijos", "Massa feita de arroz glutinoso, mergulhada no molho 3 queijos e acompanhada de cebolinha fresca.", "45", "", "esp-topokki.jpg"),
    ("esp-real",    "especiais", "Topokki Real",      "Massa de arroz glutinoso no molho 3 queijos, acrescida de uma porção de carne grelhada e cebolinhas frescas.", "60", "", None),

    ("beb-coca",      "bebidas", "Coca-cola", "", "7,00",  "", "beb-coca.png"),
    ("beb-guaravita", "bebidas", "Guaravita", "", "4,00",  "", "beb-guaravita.png"),
    ("beb-h2o",       "bebidas", "H2O",       "", "8,00",  "", "beb-h2o.png"),
    ("beb-agua",      "bebidas", "Água",      "", "4,00",  "", "beb-agua.png"),
    ("beb-cerveja",   "bebidas", "Cerveja",   "", "12,00", "", "beb-cerveja.png"),
    ("beb-soju",      "bebidas", "Soju",      "", "40,00", "", "beb-soju.png"),
]


def main():
    semente = {
        "restaurante": "aikissoba",
        "site": {
            "nome": "AIKISSOBA",
            "chamada": "Macarrão na chapa, caldo fumegante e o molho especial, receita da família — servido como em casa.",
            "url": URL_PUBLICA,
            "whatsapp": "", "instagram": "", "endereco": "", "horario": "",
            "logo": logo(),
        },
        "secoes": [{"id": i, "nome": n, "kanji": k, "estilo": e, "nota": nota} for i, n, k, e, nota in SECOES],
        "itens": [{"id": i, "secao": s, "nome": n, "desc": d, "preco": p, "tag": t,
                   "foto": foto(f) if f else "", "esgotado": False}
                  for i, s, n, d, p, t, f in ITENS],
    }
    texto = "// Gerado por gerar_semente.py. Nao edite a mao.\nwindow.SEMENTE = " + \
            json.dumps(semente, ensure_ascii=False) + ";\n"
    saida = os.path.join(BASE, "semente.js")
    io.open(saida, "w", encoding="utf-8").write(texto)
    maior = max(len(json.dumps(i)) for i in semente["itens"])
    print(f"semente.js {os.path.getsize(saida)//1024} KB | {len(semente['itens'])} itens | "
          f"maior item {maior//1024} KB (limite do Firestore: 1024 KB por documento)")


if __name__ == "__main__":
    main()

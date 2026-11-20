# Timeless – Wellness Hotel · Site de démonstration

Site vitrine de l'hôtel Timeless avec un vrai système de réservation (back-end).

## Ce qu'il faut installer (une seule fois)

1. **Visual Studio Code** (vous l'avez déjà).
2. **Node.js** : téléchargez la version « LTS » sur https://nodejs.org et installez-la (suivant, suivant, terminer).
   Pour vérifier : dans VS Code, ouvrez un terminal (menu *Terminal → Nouveau terminal*) et tapez `node -v`. Un numéro de version doit s'afficher.

Aucune autre installation n'est nécessaire : le serveur n'utilise aucun module externe.

## Lancer le site

1. Décompressez le dossier `timeless-site`.
2. Dans VS Code : *Fichier → Ouvrir le dossier…* et choisissez `timeless-site`.
3. Ouvrez un terminal (*Terminal → Nouveau terminal*) et tapez :

   ```
   node server.js
   ```

4. Ouvrez votre navigateur sur **http://localhost:3000**

Pour arrêter le serveur : cliquez dans le terminal et faites `Ctrl + C`.

## Les pages

| Adresse | Page |
| --- | --- |
| http://localhost:3000 | Accueil : histoire, concept du passage, formules, chambres, services |
| http://localhost:3000/chambres | Chambres Standard (28 · 22 m² · 170 €) et Supérieures (14 · 30 m² · 220 €) |
| http://localhost:3000/services | Restaurant + réservation de table, petit-déjeuner, Lounge, wellness, activités, Le Quai + demande de séminaire |
| http://localhost:3000/charte | Charte de déconnexion et questions fréquentes |
| http://localhost:3000/reserver | Réservation d'un séjour |
| http://localhost:3000/precheckin | Pré-check-in en ligne (avec le numéro de réservation et l'e-mail) |
| http://localhost:3000/qr | QR code vers le site, à projeter ou imprimer |
| http://localhost:3000/admin | Espace équipe : séjours, tables, séminaires et indicateurs (code : `timeless2026`) |

## Comment fonctionne le back-end

- Le client remplit le formulaire. Le prix total se calcule en direct et les disponibilités s'affichent selon les dates.
- À l'envoi, le serveur (`server.js`) **revérifie tout** : dates valides, chambre disponible, 18 ans et plus, charte acceptée, e-mail et téléphone corrects.
- Si tout est bon, la réservation reçoit un numéro (ex. `TML-4K8P2Q`), elle est enregistrée dans `data/reservations.json` et le client arrive sur sa page de confirmation (son « billet »).
- Chaque type de chambre a un nombre limité de chambres (28 + 14 = 42). Quand tout est réservé pour des dates, la chambre s'affiche « Complet ».
- Le prix est hors petit-déjeuner (option à 18 € par personne et par nuit). Les deux formules ont le même prix. Le client paie au départ.
- Après sa réservation, le client fait son **pré-check-in en ligne** : adresse, date de naissance (contrôle 18 ans et plus), heure d'arrivée, train ou voiture, allergies, formule, et acceptation de la charte.
- Les clients extérieurs peuvent **réserver une table** (55 couverts maximum par service).
- Les entreprises peuvent **demander une offre de séminaire** pour Le Quai.
- Dans l'espace équipe, trois onglets (Séjours, Restaurant, Séminaires) et des indicateurs : nuitées, chiffre d'affaires hébergement, prix moyen par nuit (ADR), part de pré-check-in faits, part de formule Aller simple, demandes de séminaire à traiter.

## Modifier le contenu

- **Prix, chambres, nombre de chambres, formules, prix de la demi-pension, taxe de séjour** : tout est dans `data/rooms.json`. Modifiez, enregistrez, rechargez la page : le site entier se met à jour.
- **Textes** : dans les fichiers `.html` du dossier `public`.
- **Couleurs et polices** : en haut du fichier `public/css/style.css`.
- **Photos** : dans `public/images` (gardez le même nom de fichier pour remplacer une photo).
- **Code admin** : en haut de `server.js` (ligne `ADMIN_CODE`).

Pour repartir de zéro avant la présentation, remplacez le contenu de `data/reservations.json`, `data/tables.json` et `data/seminaires.json` par `[]`.

## Idée pour la démo devant les professeurs

1. Montrer l'accueil et l'histoire du passage.
2. Montrer la charte de déconnexion (transparence avant la réservation).
3. Faire une réservation en direct (Chambre Supérieure, formule Aller simple, petit-déjeuner).
4. Montrer le billet, puis faire le pré-check-in en ligne.
5. Ouvrir l'espace équipe : la réservation apparaît avec son pré-check-in, et les indicateurs se mettent à jour.
6. Bonus : essayer de réserver sans cocher « 18 ans et plus », ou faire un pré-check-in avec une date de naissance de mineur, pour montrer les vérifications.

## QR code pour les professeurs

1. Lancez le site (`node server.js`) puis le tunnel (`cloudflared tunnel --url http://localhost:3000`).
2. Ouvrez votre lien **trycloudflare.com** dans le navigateur et ajoutez `/qr` à la fin.
3. Le QR code s'affiche avec la bonne adresse : projetez-le, téléchargez-le ou imprimez-le.

Attention : l'adresse trycloudflare change à chaque lancement du tunnel. Générez donc le QR code **le jour même**, après avoir lancé le tunnel, et ne fermez plus les terminaux jusqu'à la fin de la présentation.

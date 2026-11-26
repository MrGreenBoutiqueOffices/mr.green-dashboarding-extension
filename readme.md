## Mr.Green Dashboarding Extension


### Example Json for config
```json
{
  "url": {
    "Value": "https://mrgreenoffices.nl"
  }
}
```

### Betrouwbaar opstarten (2.1.1)

Bij een tijdelijk leeg Asset ID blijft de extensie op het laadscherm. Ze probeert automatisch opnieuw via een Chrome-alarm (vanaf circa 30 seconden; Chrome kan dit uitstellen). Een lege waarde wordt niet vervangen door een fictief scherm en doel-URL's worden niet meer in de sessiecache bewaard. Een bestaand foutief cache-item uit een oudere versie wordt daardoor ook genegeerd. Vaste managed URL's zonder placeholder blijven direct werken.

Het extra manifestrecht alarms is nodig om opnieuw te proberen als Chrome de MV3-serviceworker heeft stilgezet. Dit wekt geen slapend apparaat; het continu-aan-beleid in Google Admin blijft nodig. De bestaande managed JSON hoeft niet te veranderen.

Regressietests zonder extra dependencies: node --test tests/background.test.cjs.

Release: versie 2.1.1 voorbereiden/uploaden in de Chrome Web Store. De bronwijziging of een ZIP installeren geen update op bestaande Chromeboxen. Controleer na de Web Store-update op één beheerde Chromebox de automatische koppeling, bestaande signing en herstart.

import json
# TV: teams on site today
T={
"On site today": ["Сегодня на объекте", "Hoy en obra"],
"Day off for all teams": ["У всех команд выходной", "Día libre para todos los equipos"],
"Back {d} at {t}": ["Снова на работе {d} в {t}", "De vuelta {d} a las {t}"],
"tomorrow": ["завтра", "mañana"],
"Today's shift": ["Смена сегодня", "Turno de hoy"],
}
f='src/lib/i18n-dict.ts'
s=open(f).read()
T={k:v for k,v in T.items() if json.dumps(k,ensure_ascii=False)+':' not in s and f'\n  {k}:' not in s}
idx=[i for i in range(len(s)) if s.startswith('\n};',i)]
ru_end,es_end=idx[0],idx[1]
def block(k):
    return ''.join(f'\n  {json.dumps(key,ensure_ascii=False)}: {json.dumps(v[k],ensure_ascii=False)},' for key,v in T.items())
s=s[:es_end]+block(1)+s[es_end:]
s=s[:ru_end]+block(0)+s[ru_end:]
open(f,'w').write(s)
print('added',len(T))

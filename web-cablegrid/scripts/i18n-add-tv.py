import json
# TV board: gliding text, crew queue, due in days, attention counters.
T={
'Due today':('Срок сегодня','Vence hoy'),
'Due tomorrow':('Срок завтра','Vence mañana'),
'Due in {n} days':('Срок через {n} дн.','Vence en {n} días'),
'Overdue by {n} d':('Просрочено на {n} дн.','Atrasada {n} d'),
'Next up':('Следующая','La siguiente'),
'#{n} in queue':('№{n} в очереди','N.º {n} en cola'),
'{n} overdue':('просрочено: {n}','{n} atrasadas'),
'{n} due today':('срок сегодня: {n}','{n} vencen hoy'),
'New':('Новая','Nueva'),
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

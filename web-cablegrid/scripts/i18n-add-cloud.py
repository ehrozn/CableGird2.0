import json
# Cloud sync, sharing with managers, joining, presence.
T={
'Connecting…':('Подключение…','Conectando…'),
'Copy the link':('Скопируйте ссылку','Copie el enlace'),
'Create a new link (old one stops working)':('Создать новую ссылку (старая перестанет работать)','Crear un enlace nuevo (el anterior deja de funcionar)'),
'Create a new link? Managers who use the old link lose access.':('Создать новую ссылку? Менеджеры со старой ссылкой потеряют доступ.','¿Crear un enlace nuevo? Los gerentes con el enlace anterior pierden el acceso.'),
'Crew and client links from the Links page work on any phone too — the project is in the cloud.':('Ссылки бригад и заказчика со страницы «Ссылки» тоже работают на любом телефоне — проект в облаке.','Los enlaces de cuadrillas y clientes de la página Enlaces también funcionan en cualquier teléfono: el proyecto está en la nube.'),
'Deleting a project removes all its cables, reports and links for everyone, including invited managers and crews. Download a backup first.':('Удаление проекта стирает все кабели, отчёты и ссылки у всех, включая приглашённых менеджеров и бригады. Сначала скачайте резервную копию.','Eliminar un proyecto borra todos sus cables, informes y enlaces para todos, incluidos los gerentes invitados y las cuadrillas. Descargue antes una copia de seguridad.'),
'Downloading the latest data. This takes a few seconds the first time.':('Загружаем свежие данные. В первый раз это занимает несколько секунд.','Descargando los datos más recientes. La primera vez tarda unos segundos.'),
'Enter your name first — it is shown next to your changes':('Сначала введите имя — оно показывается рядом с вашими изменениями','Primero escriba su nombre: se muestra junto a sus cambios'),
'Enter your name. The team sees it next to every change you make.':('Введите имя. Команда увидит его рядом с каждым вашим изменением.','Escriba su nombre. El equipo lo verá junto a cada cambio que haga.'),
'Everyone with the manager link edits the same project in real time — on any device.':('Все, у кого есть ссылка менеджера, правят один проект в реальном времени — с любого устройства.','Todos los que tienen el enlace de gerente editan el mismo proyecto en tiempo real, desde cualquier dispositivo.'),
'Invited manager':('Приглашённый менеджер','Gerente invitado'),
'Invited managers can edit everything, but cannot delete the project, sheets, books, columns, cables, people or links.':('Приглашённые менеджеры могут править всё, но не могут удалять проект, листы, книги, столбцы, кабели, людей и ссылки.','Los gerentes invitados pueden editar todo, pero no pueden eliminar el proyecto, hojas, libros, columnas, cables, personas ni enlaces.'),
'Join project':('Войти в проект','Unirse al proyecto'),
'Leave project':('Покинуть проект','Salir del proyecto'),
'Leave “{n}”?':('Покинуть «{n}»?','¿Salir de «{n}»?'),
'Leaving removes this project from this device only. Everyone else keeps working on it, and you can join again with the link.':('Проект удалится только с этого устройства. Остальные продолжат работу, а вы сможете вернуться по ссылке.','Salir quita el proyecto solo de este dispositivo. Los demás siguen trabajando y puede volver a unirse con el enlace.'),
'Link not valid':('Ссылка недействительна','Enlace no válido'),
'Loading…':('Загрузка…','Cargando…'),
'Manager link':('Ссылка для менеджера','Enlace de gerente'),
'New link created — the old one no longer works':('Новая ссылка создана — старая больше не работает','Enlace nuevo creado: el anterior ya no funciona'),
'No connection. Try again.':('Нет соединения. Попробуйте ещё раз.','Sin conexión. Inténtelo de nuevo.'),
'Nobody else is here right now.':('Сейчас здесь больше никого нет.','Ahora mismo no hay nadie más.'),
'Offline — changes wait':('Нет сети — изменения ждут','Sin conexión: los cambios esperan'),
'Online now':('Сейчас онлайн','En línea ahora'),
'Opening the project…':('Открываем проект…','Abriendo el proyecto…'),
'Saving…':('Сохранение…','Guardando…'),
'Share':('Поделиться','Compartir'),
'Shared with you':('Доступ открыт вам','Compartido con usted'),
'Shown next to every change you make, so the team knows who did what.':('Показывается рядом с каждым вашим изменением, чтобы команда знала, кто что сделал.','Se muestra junto a cada cambio que haga, para que el equipo sepa quién hizo qué.'),
'Synced':('Синхронизировано','Sincronizado'),
'This device only':('Только это устройство','Solo este dispositivo'),
'This link was replaced or the project was deleted. Ask the project manager for a new one.':('Ссылка заменена или проект удалён. Попросите у руководителя проекта новую.','El enlace fue reemplazado o el proyecto se eliminó. Pida uno nuevo al gerente del proyecto.'),
'This project is stored on this device only. Make a copy from a backup to share it.':('Этот проект хранится только на этом устройстве. Чтобы поделиться, создайте копию из резервной копии.','Este proyecto se guarda solo en este dispositivo. Para compartirlo, cree una copia desde una copia de seguridad.'),
'Unnamed':('Без имени','Sin nombre'),
'Uploading {n}%':('Загрузка {n}%','Subiendo {n}%'),
'Work together':('Совместная работа','Trabajar juntos'),
'You are invited to a project':('Вас пригласили в проект','Le invitaron a un proyecto'),
'e.g. Anna Petrova':('например, Анна Петрова','p. ej., Ana Pérez'),
'you':('вы','usted'),
'Owner':('Владелец','Propietario'),
'Crew link':('Ссылка бригады','Enlace de cuadrilla'),
'Client link':('Ссылка заказчика','Enlace de cliente'),
'Only the project owner can delete':('Удалять может только владелец проекта','Solo el propietario del proyecto puede eliminar'),
'Project “{n}” was deleted by its owner':('Владелец удалил проект «{n}»','El propietario eliminó el proyecto «{n}»'),
'Your access to “{n}” was revoked':('Ваш доступ к «{n}» отозван','Se revocó su acceso a «{n}»'),
'Link copied':('Ссылка скопирована','Enlace copiado'),
'Your name':('Ваше имя','Su nombre'),
'You':('Вы','Usted'),
"I'm not on the list — continue as {crew}":('Меня нет в списке — продолжить как «{crew}»','No estoy en la lista: continuar como {crew}'),
'New report #{n} from {crew}':('Новый отчёт №{n} от «{crew}»','Nuevo informe n.º {n} de {crew}'),
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

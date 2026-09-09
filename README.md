<H1>HOW TO SET UP</H1>
<br>
<br>
<strong><p style font-family: Times New Roman',>1. Get a Node JS panel, it must be node 22 and above .
<br>
<br>
2. Upload the file to the panel 
<br>
<br>
3. Unzip the file 
<br>
<br>
4. Delete the zip file 
<br>
<br>
5. set the start up command to victory-bot.js
<br>
<br>
6. if your panel doesn't allow you set start up command , then run "npm start"
<br>
<br>
7. change the env file name to ".env "in the .env file ass your bot token , owner id, and user link
<br>
<br>
8. start the panel
<br>
<br>
9. if your panel gives a container error , move the files to ../</p></strong>


<h2>Force-join and Telegram 404 troubleshooting</h2>
<p><code>FORCE_JOIN_LINKS</code> must contain exactly eight comma-separated public Telegram links or usernames. The bot checks each configured chat with <code>getChatMember</code> and requires the user to have status <code>member</code>, <code>administrator</code>, <code>creator</code>, or an active restricted membership. The bot must be an administrator in every configured group or channel. Private invite links such as <code>https://t.me/+...</code> and <code>https://t.me/joinchat/...</code> cannot be resolved to a chat identifier by the Telegram Bot API, so they cannot be verified from the link alone.</p>
<p>The startup code now calls Telegram <code>getMe</code> before polling. If Telegram returns <code>ETELEGRAM 404</code>, the configured <code>BOT_TOKEN</code> is invalid or malformed; replace it with the complete token copied from <code>@BotFather</code>, without quotes or spaces. A group/channel lookup failure is reported separately as a per-link force-join warning and is treated as unverified rather than silently allowing access.</p>

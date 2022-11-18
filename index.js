//LIBRARY TO READ FILES
import { debug } from 'console';
import * as fs from 'fs/promises';


let lastUsedId = "";
//TRY TO INITIALIZE LAST USED ID TO WHATEVER IS IN POST_ID
try {
    lastUsedId = await fs.readFile("./post_id.txt", { encoding: "utf8" });
} catch (error) {
}


main();
//POST EACH 5 minutes
setInterval(main, 1000 * 60 * 5)


//RETRIEVES THE LAST REDDIT POSTS IN R/AMITHEASSHOLE AND CHECKS IF IT'S ALREADY UPLOADED TO MASTODON
//IF IT'S NOT, WILL PUBLISH A THREAD WITH THE CONTENT OF THE LATEST POST AND WILL ADD A POLL AT THE END
async function main() {
    let accTokenReddit = await redditToken();
    let latestReddditPostArr = await latestRedditPosts(accTokenReddit);
    for (let npost = 0; npost < latestReddditPostArr.length; npost++) {
        let cpost = latestReddditPostArr[npost];
        let postInfo = relevantPost(cpost);
        if (npost == 0) await updatelastUsedId(postInfo.id);
        debugger;
        await postStates(postInfo);
    }
}

//RETURNS A NEW ACCESS TOKEN
async function redditToken() {
    //IT READS THE CLIENT ID AND THE SECRET
    let rid = await fs.readFile("./reddit_id.txt", { encoding: "utf8" });
    let rsecret = await fs.readFile("./reddit_secret.txt", { encoding: "utf8" });
    //BEARER TOKEN REQUEST
    let id = "Basic " + btoa(rid + ":" + rsecret);
    const data = await fetch('https://www.reddit.com/api/v1/access_token',
        {
            body: "grant_type=client_credentials",
            headers: { Authorization: id, "Content-Type": "application/x-www-form-urlencoded" },
            method: "POST"
        });
    const obj = await data.json();
    console.log(obj);
    /*
    {
    "access_token": Your access token,
    "token_type": "bearer",
    "expires_in": Unix Epoch Seconds,
    "scope": A scope string,
    }
    */
    return obj.access_token;
}

//RETURN LATEST REDDIT POST
async function latestRedditPosts(token) {

    const options = {
        method: 'GET',
        headers: { Authorization: "bearer " + token }
    };
    let post = null;
    if (lastUsedId.length == 0) {
        let data = await fetch('https://oauth.reddit.com/r/AmItheAsshole/new?limit=3', options);
        post = await data.json();
    } else {
        let data = await fetch('https://oauth.reddit.com/r/AmItheAsshole/new?limit=100&before=' + lastUsedId, options);
        post = await data.json();
    }

    return post.data.children;
}

/*EXTRACT RELEVANT INFORMATION ABOUT THE POST IN THE FOLLOWING FORMAT
    {
        title: "title",
        text: "text",
        url: "url",
        id: "id"
    }
*/
function relevantPost(post) {
    let postInfo = post.data;
    let relPostInfo = {
        title: postInfo.title,
        text: postInfo.selftext,
        url: postInfo.url,
        id: "t3_" + postInfo.id
    }
    return relPostInfo;
}

/*POST STATES AS A THREAD*/
async function postStates(info) {

    let token = await fs.readFile("./mastodon_token.txt", { encoding: "utf8" });

    //PRIMER TOOT CON EL TITULO
    let params = new URLSearchParams();
    params.set("status", info.title + "\n\n" + info.url + "\n\n\n#AITA #AmITheAsshole #Bot #Bots #Reddit");
    params.set("media_ids[]", []);

    let data = await fetch('https://botsin.space/api/v1/statuses',
        {
            body: params.toString(),
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
            method: "POST"
        });
    let obj = await data.json();
    let lastId = obj.id;

    //PIN FIRST TOOT
    data = await fetch("https://botsin.space/api/v1/statuses/" + lastId + "/pin",
        {
            headers: { Authorization: "Bearer " + token },
            method: "POST"
        });

    //SIGUIENTES TOOTS CON TODO EL TEXTO
    let txt = info.text;
    let prgrph = txt.split("\n");
    for (let npr = 0; npr < prgrph.length; npr++) {
        let pr = prgrph[npr];
        if (pr !== "" && pr !== " ") {
            //Split paragraph in words
            let words = pr.split(" ");
            let tootContent = "";
            for (let nw = 0; nw < words.length; nw++) {
                let cword = words[nw];
                if ((tootContent.length + cword.length + 1) <= 500) {
                    //If adding a new word will fit, we add it to cword
                    tootContent += tootContent.length == 0 ? cword : (" " + cword);
                } else {
                    //If adding a new word wont fit we send the current toot
                    let params = new URLSearchParams();
                    params.set("status", tootContent);
                    params.set("media_ids[]", []);
                    params.set("visibility", "unlisted");
                    params.set("in_reply_to_id", lastId);
                    let data = await fetch('https://botsin.space/api/v1/statuses',
                        {
                            body: params.toString(),
                            headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
                            method: "POST"
                        });
                    let obj = await data.json();
                    lastId = obj.id;

                    //And set the new value to tootContent
                    tootContent = cword;
                }
            }

            //If tootContent has something in it we have to publish it
            if (tootContent.length > 0) {
                let params = new URLSearchParams();
                params.set("status", tootContent);
                params.set("media_ids[]", []);
                params.set("visibility", "unlisted");
                params.set("in_reply_to_id", lastId);
                let data = await fetch('https://botsin.space/api/v1/statuses',
                    {
                        body: params.toString(),
                        headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
                        method: "POST"
                    });
                let obj = await data.json();
                lastId = obj.id;
            }
        }
    }


    //ENCUESTA
    params = new URLSearchParams();
    params.set("status", "This is the real poll test and an answer!!");
    params.append("poll[options][]", "YTA - YOU THE ASSHOLE");
    params.append("poll[options][]", "NTA - NOT THE ASSHOLE");
    params.append("poll[options][]", "ESH - EVERYONE SUCKS HERE");
    params.append("poll[options][]", "NAH - NO ASSHOLES HERE");
    params.set("poll[expires_in]", 604800);
    params.set("visibility", "unlisted");
    params.set("in_reply_to_id", lastId);
    data = await fetch('https://botsin.space/api/v1/statuses',
        {
            body: params.toString(),
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/x-www-form-urlencoded" },
            method: "POST"
        });
    obj = await data.json();
    lastId = obj.id;
}

//Updates de value of lasUsedId both in lastUsedId variable and post_id.txt
async function updatelastUsedId(id){
    await fs.writeFile("./post_id.txt", id, { encoding : "utf8"});
    lastUsedId = id;
}
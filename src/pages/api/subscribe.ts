import { NextApiRequest, NextApiResponse } from "next";
import { query as q } from "faunadb";
import { getSession } from 'next-auth/client'
import { fauna } from "../../services/fauna";
import { stripe } from "../../services/stripe";


type User = {
    ref: {
        id: string;
    }
    data: {
        stripe_customer_id: string
    }
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        const session = await getSession({ req })

        const user = await fauna.query<User>(
            q.Get(
                q.Match(
                    q.Index('user_by_email'),
                    q.Casefold(session.user.email)
                )
            )
        )

        let customerId = user.data.stripe_customer_id

        if (!customerId) {
            const stripeCustumer = await stripe.customers.create({
                email: session.user.email,
                //metadata
            })


            await fauna.query(
                q.Update(
                    q.Ref(q.Collection('users'), user.ref.id),
                    {
                        data: {
                            stripe_customer_id: stripeCustumer.id,
                        }
                    }
                )
            )

            customerId = stripeCustumer.id 
        }



        const stripeCheckoutSession = await stripe.checkout.sessions.create({
            success_url: 'http://localhost:3000/posts',
            cancel_url: 'http://localhost:3000/',
            customer: customerId,
            payment_method_types: ['card'],
            billing_address_collection: 'required',
            line_items: [
                { price: 'price_1JwTIKI6Lvo137CvUoTCDr6U', quantity: 1 }
            ],
            mode: 'subscription',
            allow_promotion_codes: true,
        })
        return res.status(200).json({ sessionId: stripeCheckoutSession.id })
    } else {
        res.setHeader('Allow', 'POST')
        res.status(405).end('Method not allowed')
    }
}